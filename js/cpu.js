import { COLS, ROWS, COLORS, OJAMA_COLOR, INSANE_WEIGHTS } from './constants.js';

export class CPUPlayer {
    constructor(gameState, difficulty = 'normal') {
        this.gameState = gameState;
        this.difficulty = difficulty; // 'easy' | 'normal' | 'hard'
    }

    async makeMove() {
        if (!this.gameState.currentPuyo || this.gameState.gameOver) return;

        // 難易度に応じた思考時間
        const thinkTime = this.difficulty === 'easy' ? 500 : this.difficulty === 'normal' ? 300 : 200;
        await new Promise(resolve => setTimeout(resolve, thinkTime));

        const bestMove = this.findBestMove();

        const rotDelay  = 100;
        const moveDelay = 100;
        const fallDelay =  50;

        // 回転
        for (let i = 0; i < bestMove.rotation; i++) {
            this.gameState.rotate(true);
            await new Promise(resolve => setTimeout(resolve, rotDelay));
        }

        // 水平移動
        const moves = bestMove.x - this.gameState.currentPuyo.x;
        for (let i = 0; i < Math.abs(moves); i++) {
            if (moves > 0) this.gameState.moveRight();
            else            this.gameState.moveLeft();
            await new Promise(resolve => setTimeout(resolve, moveDelay));
        }

        // 高速落下
        while (this.gameState.canMove(0, 1)) {
            await this.gameState.fall();
            await new Promise(resolve => setTimeout(resolve, fallDelay));
        }
        await this.gameState.lockPuyo();
    }

    findBestMove() {
        if (this.difficulty === 'hard') return this.findBestMoveInsane();

        let bestScore = -Infinity;
        let bestMove = { x: 2, rotation: 0 };

        for (let rotation = 0; rotation < 4; rotation++) {
            for (let x = 0; x < COLS; x++) {
                const score = this.evaluateMove(x, rotation);
                const finalScore = this.difficulty === 'easy' ? score + Math.random() * 200 - 100 : score;
                if (finalScore > bestScore) {
                    bestScore = finalScore;
                    bestMove = { x, rotation };
                }
            }
        }
        return bestMove;
    }

    // ===== ビームサーチ（幅5 × 深さ5手） — つよいモード =====
    findBestMoveInsane() {
        const BEAM_WIDTH = 5;
        const DEPTH      = 5;
        const MC_SAMPLES = 3;
        const DISCOUNTS  = [1.0, 0.65, 0.40, 0.22, 0.12];

        const opp = this.gameState.opponent;
        this._currentThreat = this._evalThreat(opp);

        // 深さ0: 現在のぷよを全配置試行
        let beam = [];
        for (let rot = 0; rot < 4; rot++) {
            for (let x = 0; x < COLS; x++) {
                const b = this._simPlace(this.gameState.board, { ...this.gameState.currentPuyo, x, rotation: rot });
                if (!b) continue;
                const { score, postBoard } = this._scoreInsaneFull(b, opp);
                beam.push({ board: postBoard, score: score * DISCOUNTS[0], firstMove: { x, rotation: rot } });
            }
        }
        beam.sort((a, b) => b.score - a.score);
        beam = beam.slice(0, BEAM_WIDTH);

        const knownPieces = [this.gameState.nextPuyo1, this.gameState.nextPuyo2];

        // 深さ1〜4: ビームを展開
        for (let depth = 1; depth < DEPTH; depth++) {
            const discount = DISCOUNTS[depth];
            const isKnown  = depth <= 2;
            const newBeam  = [];

            for (const state of beam) {
                if (isKnown) {
                    const piece = knownPieces[depth - 1];
                    if (!piece) continue;
                    let bestScore = -Infinity, bestBoard = null;
                    for (let rot = 0; rot < 4; rot++) {
                        for (let x = 0; x < COLS; x++) {
                            const b = this._simPlace(state.board, { ...piece, x, rotation: rot });
                            if (!b) continue;
                            const { score, postBoard } = depth <= 1
                                ? this._scoreInsaneFull(b, null)
                                : this._scoreInsaneDeep(b);
                            if (score > bestScore) { bestScore = score; bestBoard = postBoard; }
                        }
                    }
                    if (bestBoard) {
                        newBeam.push({ board: bestBoard, score: state.score + bestScore * discount, firstMove: state.firstMove });
                    }
                } else {
                    // モンテカルロ期待値推定
                    let totalScore = 0, sampleBoard = null, count = 0;
                    for (let mc = 0; mc < MC_SAMPLES; mc++) {
                        const piece = this._randomPuyo();
                        let bestScore = -Infinity, bestBoard = null;
                        for (let rot = 0; rot < 4; rot++) {
                            for (let x = 0; x < COLS; x++) {
                                const b = this._simPlace(state.board, { ...piece, x, rotation: rot });
                                if (!b) continue;
                                const { score, postBoard } = this._scoreInsaneDeep(b);
                                if (score > bestScore) { bestScore = score; bestBoard = postBoard; }
                            }
                        }
                        if (bestBoard) { totalScore += bestScore; sampleBoard = bestBoard; count++; }
                    }
                    if (count > 0 && sampleBoard) {
                        newBeam.push({ board: sampleBoard, score: state.score + (totalScore / count) * discount, firstMove: state.firstMove });
                    }
                }
            }

            newBeam.sort((a, b) => b.score - a.score);
            beam = newBeam.slice(0, BEAM_WIDTH);
            if (beam.length === 0) break;
        }

        return beam[0]?.firstMove || { x: 2, rotation: 0 };
    }

    _randomPuyo() {
        return {
            x: 2, y: 0, rotation: 0,
            color1: COLORS[Math.floor(Math.random() * COLORS.length)],
            color2: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
    }

    /** 相手の脅威度を 0〜10 で返す（おじゃま待ち + 発火ポテンシャル） */
    _evalThreat(opponent) {
        if (!opponent) return 0;
        let threat = Math.min((opponent.pendingOjama || 0) * 0.7, 5);
        threat += Math.min(this.evaluateChainTriggerPotential(opponent.board), 5);
        return Math.min(threat, 10);
    }

    /** 連鎖から発生するおじゃまぷよ数を概算 */
    _estimateOjama(chainCount, totalCleared) {
        if (chainCount === 0 || totalCleared === 0) return 0;
        const chainBonuses = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256];
        const cb = chainBonuses[Math.min(chainCount, chainBonuses.length - 1)];
        return Math.floor(totalCleared * Math.max(1, cb + 3) * 10 / 70);
    }

    /** 完全評価（深さ0-1 用）: フェーズ別戦略 + 相手ボード考慮 */
    _scoreInsaneFull(board, opponent) {
        const w = INSANE_WEIGHTS;
        const bc = board.map(r => [...r]);
        const { chainCount, totalCleared } = this.simulateChainsOnBoard(bc);
        const postBoard = board.map(r => [...r]);
        this.simulateChainsOnBoard(postBoard);

        if (postBoard[0][2] !== 0) return { score: -Infinity, postBoard };

        let score = 0;
        const trigger      = this.evaluateChainTriggerPotential(postBoard);
        const ojamaOut     = this._estimateOjama(chainCount, totalCleared);
        const threat       = this._currentThreat || 0;
        const myPending    = this.gameState?.pendingOjama || 0;
        const ojamaOnBoard = this.countOjamaOnBoard(board);
        const ojamaAfter   = this.countOjamaOnBoard(postBoard);
        const ojamaCleared = ojamaOnBoard - ojamaAfter;

        if (threat >= 7 || myPending >= 12) {
            // 【緊急発火】相手が今すぐ大連鎖 or 大量おじゃま到来
            if (ojamaOut >= 5) score += ojamaOut * 250 + chainCount * 1500;
            score -= (8 - Math.min(chainCount, 8)) * 400;
            score += trigger * 20;
        } else if (threat >= 4) {
            // 【速攻フェーズ】
            if (ojamaOut >= 10) {
                score += ojamaOut * 150 + chainCount * 1000;
            } else if (chainCount >= 5) {
                score += ojamaOut * 200 + chainCount * 1500;
            } else {
                score += trigger >= 5 ? trigger * trigger * w.triggerWeight : -600;
            }
        } else {
            // 【大連鎖構築フェーズ】10連鎖以上を目指す
            if (chainCount >= 8)      score += Math.pow(chainCount, 3) * 80 + ojamaOut * 200;
            else if (chainCount >= 5) score += chainCount * chainCount * w.chain3Bonus + ojamaOut * 80;
            else if (chainCount >= 3) score += chainCount * chainCount * w.chain3Bonus * 0.4;
            if (chainCount <= 2 && ojamaOut < 12) score -= ojamaOut * 80;

            if (trigger >= 7)      score += trigger ** 3 * 15 + trigger * trigger * w.triggerWeight;
            else if (trigger >= 4) score += trigger * trigger * w.triggerWeight;
            else                   score += trigger * w.triggerWeight * 0.3;
        }

        // 構造評価（共通）
        score += this.countNearGroups(postBoard)    * w.nearGroupWeight;
        score += this.evaluateColorStack(postBoard) * w.colorStackWeight;
        score -= this.getMaxHeight(postBoard)        * w.heightPenalty;
        score -= this.countHoles(postBoard)          * w.holePenalty;
        score -= this.getHeightVariance(postBoard)   * w.variancePenalty;
        score -= this.countDangerPieces(postBoard)   * w.dangerPenalty;
        score -= this.countIsolatedColors(postBoard) * w.colorIsolationPenalty;

        // 詰み回避
        let col2H = 0;
        for (let row = 0; row < ROWS; row++) {
            if (postBoard[row][2] !== 0) { col2H = ROWS - row; break; }
        }
        if (col2H >= ROWS - 1)      score -= 15000;
        else if (col2H >= ROWS - 2) score -= col2H * 600;

        // おじゃま消去評価
        if (ojamaOnBoard >= 6) {
            score += ojamaCleared * 400;
            score -= ojamaOnBoard * 60;
            if (ojamaCleared >= 4) score += 2000;
        } else if (ojamaOnBoard > 0) {
            score += ojamaCleared * 200;
            score -= ojamaOnBoard * 25;
        }

        return { score, postBoard };
    }

    /** 軽量評価（深さ2以降用） */
    _scoreInsaneDeep(board) {
        const w = INSANE_WEIGHTS;
        const bc = board.map(r => [...r]);
        const { chainCount, totalCleared } = this.simulateChainsOnBoard(bc);
        const postBoard = board.map(r => [...r]);
        this.simulateChainsOnBoard(postBoard);

        if (postBoard[0][2] !== 0) return { score: -Infinity, postBoard };

        let score = 0;
        const ojamaOut     = this._estimateOjama(chainCount, totalCleared);
        const threat       = this._currentThreat || 0;
        const ojamaOnBoard = this.countOjamaOnBoard(board);
        const ojamaCleared = ojamaOnBoard - this.countOjamaOnBoard(postBoard);

        if (threat >= 7) {
            score += ojamaOut * 150 + chainCount * 800;
        } else if (threat >= 4) {
            if (ojamaOut >= 8)        score += ojamaOut * 100 + chainCount * 600;
            else if (chainCount >= 4) score += ojamaOut * 120 + chainCount * 800;
        } else {
            if (chainCount >= 6)      score += chainCount ** 2 * w.largeChainBonus;
            else if (chainCount >= 3) score += chainCount * chainCount * w.chain3Bonus;
            if (chainCount <= 2 && ojamaOut < 10) score -= ojamaOut * 50;
        }

        score += this.countNearGroups(postBoard)    * w.nearGroupWeight;
        score += this.evaluateColorStack(postBoard) * w.colorStackWeight;
        score -= this.getMaxHeight(postBoard)        * w.heightPenalty;
        score -= this.countHoles(postBoard)          * w.holePenalty;
        score -= this.countDangerPieces(postBoard)   * w.dangerPenalty;

        let col2H = 0;
        for (let row = 0; row < ROWS; row++) {
            if (postBoard[row][2] !== 0) { col2H = ROWS - row; break; }
        }
        if (col2H >= ROWS - 1)      score -= 15000;
        else if (col2H >= ROWS - 2) score -= col2H * 600;

        score -= ojamaOnBoard * 40;
        score += ojamaCleared * 200;

        return { score, postBoard };
    }

    evaluateMove(x, rotation) {
        const simBoard = this.gameState.board.map(row => [...row]);
        const testPuyo = { ...this.gameState.currentPuyo, x, rotation, y: 0 };

        while (this.canMoveInSim(testPuyo, simBoard, 0, 1)) testPuyo.y++;

        const positions = this.gameState.getPuyoPositionsFor(testPuyo);
        if (positions.some(pos => pos.y < 0 || pos.x < 0 || pos.x >= COLS)) return -Infinity;

        simBoard[positions[0].y][positions[0].x] = testPuyo.color1;
        simBoard[positions[1].y][positions[1].x] = testPuyo.color2;

        return this.difficulty === 'easy' ? this.evaluateEasy(simBoard) : this.evaluateNormal(simBoard);
    }

    evaluateEasy(board) {
        return -this.getMaxHeight(board) * 5 - this.countHoles(board) * 10;
    }

    evaluateNormal(board) {
        let score = 0;
        const testBoard = board.map(r => [...r]);
        const { chainCount, totalCleared } = this.simulateChainsOnBoard(testBoard);
        if (chainCount > 0) score += chainCount * 200 + totalCleared * 15;
        score += this.evaluateChainTriggerPotential(board) * 80;
        score += this.countNearGroups(board) * 3;
        score -= this.getMaxHeight(board) * 12;
        score -= this.countHoles(board) * 35;
        return score;
    }

    // ===== 連鎖シミュレーション =====

    simulateChainsOnBoard(board) {
        let chain = 0, totalCleared = 0;
        while (true) {
            const cleared = this.clearConnectedInSim(board);
            if (cleared === 0) break;
            chain++;
            totalCleared += cleared;
            this.applyGravityInSim(board);
        }
        return { chainCount: chain, totalCleared };
    }

    clearConnectedInSim(board) {
        const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        const toClear = [];
        let colorCleared = 0;

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0 && board[row][col] !== OJAMA_COLOR && !visited[row][col]) {
                    const color = board[row][col];
                    const group = this.findConnectedGroupInSim(board, row, col, color, visited);
                    if (group.length >= 4) {
                        colorCleared += group.length;
                        for (const pos of group) {
                            toClear.push(pos);
                            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                                const nr = pos.row + dr, nc = pos.col + dc;
                                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS &&
                                    board[nr][nc] === OJAMA_COLOR &&
                                    !toClear.some(p => p.row === nr && p.col === nc)) {
                                    toClear.push({ row: nr, col: nc });
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const pos of toClear) board[pos.row][pos.col] = 0;
        return colorCleared;
    }

    applyGravityInSim(board) {
        let moved = true;
        while (moved) {
            moved = false;
            for (let row = ROWS - 2; row >= 0; row--) {
                for (let col = 0; col < COLS; col++) {
                    if (board[row][col] !== 0 && board[row + 1][col] === 0) {
                        board[row + 1][col] = board[row][col];
                        board[row][col] = 0;
                        moved = true;
                    }
                }
            }
        }
    }

    evaluateChainTriggerPotential(board) {
        let maxChain = 0;
        for (const color of COLORS) {
            for (let col = 0; col < COLS; col++) {
                let targetRow = -1;
                for (let row = ROWS - 1; row >= 0; row--) {
                    if (board[row][col] === 0) { targetRow = row; break; }
                }
                if (targetRow === -1) continue;
                const testBoard = board.map(r => [...r]);
                testBoard[targetRow][col] = color;
                const { chainCount } = this.simulateChainsOnBoard(testBoard);
                if (chainCount > maxChain) maxChain = chainCount;
            }
        }
        return maxChain;
    }

    countNearGroups(board) {
        let score = 0;
        const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0 && board[row][col] !== OJAMA_COLOR && !visited[row][col]) {
                    const group = this.findConnectedGroupInSim(board, row, col, board[row][col], visited);
                    if (group.length === 2)     score += 5;
                    else if (group.length === 3) score += 20;
                    else if (group.length >= 4)  score += 50;
                }
            }
        }
        return score;
    }

    getHeightVariance(board) {
        const heights = Array.from({ length: COLS }, (_, col) => {
            for (let row = 0; row < ROWS; row++) {
                if (board[row][col] !== 0) return ROWS - row;
            }
            return 0;
        });
        const avg = heights.reduce((a, b) => a + b, 0) / COLS;
        return heights.reduce((sum, h) => sum + Math.abs(h - avg), 0);
    }

    canMoveInSim(puyo, board, dx, dy) {
        const testPuyo = { ...puyo, x: puyo.x + dx, y: puyo.y + dy };
        return this.gameState.getPuyoPositionsFor(testPuyo).every(pos =>
            pos.x >= 0 && pos.x < COLS && pos.y < ROWS &&
            (pos.y < 0 || board[pos.y][pos.x] === 0)
        );
    }

    getMaxHeight(board) {
        for (let row = 0; row < ROWS; row++)
            for (let col = 0; col < COLS; col++)
                if (board[row][col] !== 0) return ROWS - row;
        return 0;
    }

    countHoles(board) {
        let holes = 0;
        for (let col = 0; col < COLS; col++) {
            let found = false;
            for (let row = 0; row < ROWS; row++) {
                if (board[row][col] !== 0) found = true;
                else if (found) holes++;
            }
        }
        return holes;
    }

    countDangerPieces(board) {
        let count = 0;
        for (let row = 0; row < 3; row++)
            for (let col = 0; col < COLS; col++)
                if (board[row][col] !== 0) count++;
        return count;
    }

    countOjamaOnBoard(board) {
        let count = 0;
        for (let row = 0; row < ROWS; row++)
            for (let col = 0; col < COLS; col++)
                if (board[row][col] === OJAMA_COLOR) count++;
        return count;
    }

    countIsolatedColors(board) {
        const vis = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        let isolated = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c] !== 0 && board[r][c] !== OJAMA_COLOR && !vis[r][c]) {
                    if (this.findConnectedGroupInSim(board, r, c, board[r][c], vis).length < 3) isolated++;
                }
            }
        }
        return isolated;
    }

    evaluateColorStack(board) {
        let score = 0;
        for (let col = 0; col < COLS; col++) {
            const colPieces = {};
            for (let row = 0; row < ROWS; row++) {
                const c = board[row][col];
                if (c !== 0 && c !== OJAMA_COLOR) {
                    (colPieces[c] ??= []).push(row);
                }
            }
            for (const color of COLORS) {
                const rows = colPieces[color];
                if (!rows || rows.length < 2) continue;
                for (let i = 0; i < rows.length - 1; i++) {
                    const dist = rows[i + 1] - rows[i];
                    if (dist <= 4) score += Math.max(0, 5 - dist);
                }
            }
        }
        return score;
    }

    _simPlace(baseBoard, puyo) {
        const board = baseBoard.map(r => [...r]);
        const t = { ...puyo, y: 0 };
        while (this.canMoveInSim(t, board, 0, 1)) t.y++;
        const pos = this.gameState.getPuyoPositionsFor(t);
        if (pos.some(p => p.y < 0 || p.x < 0 || p.x >= COLS)) return null;
        if (pos.some(p => p.y >= 0 && board[p.y][p.x] !== 0)) return null;
        board[pos[0].y][pos[0].x] = t.color1;
        board[pos[1].y][pos[1].x] = t.color2;
        return board;
    }

    findConnectedGroupInSim(board, row, col, color, visited) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return [];
        if (visited[row][col] || board[row][col] !== color) return [];
        visited[row][col] = true;
        const group = [{ row, col }];
        group.push(...this.findConnectedGroupInSim(board, row - 1, col, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row + 1, col, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row, col - 1, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row, col + 1, color, visited));
        return group;
    }
}
