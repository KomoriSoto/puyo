import { COLS, ROWS, CELL_SIZE, COLORS, FALL_SPEED, FAST_FALL_SPEED, SPAWN_DELAY, OJAMA_COLOR, puyoImages } from './constants.js';

export class GameState {
    constructor(boardCanvas, nextCanvas1, nextCanvas2, scoreElement, ojamaIndicator, ojamaCountElement, isPlayer = true) {
        this.board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
        this.boardCanvas = boardCanvas;
        this.nextCanvas1 = nextCanvas1;
        this.nextCanvas2 = nextCanvas2;
        this.scoreElement = scoreElement;
        this.ojamaIndicator = ojamaIndicator;
        this.ojamaCountElement = ojamaCountElement;
        this.ctx = boardCanvas.getContext('2d');
        this.nextCtx1 = nextCanvas1.getContext('2d');
        this.nextCtx2 = nextCanvas2.getContext('2d');

        // キャンバスのリセット（前回のscaleをクリア）
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.nextCtx1.setTransform(1, 0, 0, 1, 0, 0);
        this.nextCtx2.setTransform(1, 0, 0, 1, 0, 0);

        // 高解像度対応: キャンバスを3倍にスケール
        this.ctx.scale(3, 3);
        this.nextCtx1.scale(3, 3);
        this.nextCtx2.scale(3, 3);

        // 画像スムージングを無効化（ピクセルアートをくっきり表示）
        this.ctx.imageSmoothingEnabled = false;
        this.nextCtx1.imageSmoothingEnabled = false;
        this.nextCtx2.imageSmoothingEnabled = false;

        this.score = 0;
        this.isPlayer = isPlayer;
        this.gameOver = false;
        this.pendingOjama = 0;
        this.opponent = null;

        this.currentPuyo = null;
        this.nextPuyo1 = this.generatePuyo();
        this.nextPuyo2 = this.generatePuyo();
        this.fallTimer = null;
        this.fastFall = false;
        this.spawning = false;
        this.showReady = false;
        this.showWin = false;
        this.showLose = false;
        this.showTazen = false;  // 1本先取時の勝利表示フラグ
        this.showGununu = false; // 1本先取時の敗北表示フラグ
    }

    generatePuyo() {
        const color1 = COLORS[Math.floor(Math.random() * COLORS.length)];
        const color2 = COLORS[Math.floor(Math.random() * COLORS.length)];
        return { x: 2, y: 0, color1, color2, rotation: 0 };
    }

    spawnPuyo() {
        this.currentPuyo = { ...this.nextPuyo1, x: 2, y: 0 };
        this.nextPuyo1 = this.nextPuyo2;
        this.nextPuyo2 = this.generatePuyo();
        this.drawNext();

        const positions = this.getPuyoPositions();
        const canSpawn = positions.every(pos => {
            if (pos.y < 0) return true;
            return this.board[pos.y][pos.x] === 0;
        });

        if (!canSpawn) {
            if (this.board[0][2] !== 0) {
                this.gameOver = true;
            }
            return false;
        }
        return true;
    }

    drawNext() {
        // NEXT 1 — 縦並び（上がcolor2、下がcolor1）
        this.nextCtx1.clearRect(0, 0, this.nextCanvas1.width, this.nextCanvas1.height);
        this.drawPuyoCircle(this.nextCtx1, 30, 25, this.nextPuyo1.color2);
        this.drawPuyoCircle(this.nextCtx1, 30, 60, this.nextPuyo1.color1);

        // NEXT 2
        this.nextCtx2.clearRect(0, 0, this.nextCanvas2.width, this.nextCanvas2.height);
        this.drawPuyoCircle(this.nextCtx2, 30, 25, this.nextPuyo2.color2);
        this.drawPuyoCircle(this.nextCtx2, 30, 60, this.nextPuyo2.color1);
    }

    drawPuyoCircle(ctx, x, y, color) {
        const width = 100;
        const height = 45;

        if (puyoImages[color] && puyoImages[color].complete && puyoImages[color].naturalWidth > 0) {
            ctx.drawImage(puyoImages[color], x - width / 2, y - height / 2, width, height);
        } else {
            // 画像未読み込み時のフォールバック描画
            const radius = 15;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = color === OJAMA_COLOR ? '#666666' : color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            if (color === OJAMA_COLOR) {
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x - 7, y - 7);
                ctx.lineTo(x + 7, y + 7);
                ctx.moveTo(x + 7, y - 7);
                ctx.lineTo(x - 7, y + 7);
                ctx.stroke();
            } else {
                const gradient = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(x - 5, y - 3, 3.5, 0, Math.PI * 2);
                ctx.arc(x + 5, y - 3, 3.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(x - 5, y - 3, 1.8, 0, Math.PI * 2);
                ctx.arc(x + 5, y - 3, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);

        // 死亡ゾーン（3列目最上段）の×マーク
        const markX = 2 * CELL_SIZE + CELL_SIZE / 2;
        const markY = CELL_SIZE / 2;
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 2;
        const markSize = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(markX - markSize, markY - markSize);
        this.ctx.lineTo(markX + markSize, markY + markSize);
        this.ctx.moveTo(markX + markSize, markY - markSize);
        this.ctx.lineTo(markX - markSize, markY + markSize);
        this.ctx.stroke();

        // ボード描画
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (this.board[row][col] !== 0) {
                    this.drawPuyoCircle(
                        this.ctx,
                        col * CELL_SIZE + CELL_SIZE / 2,
                        row * CELL_SIZE + CELL_SIZE / 2,
                        this.board[row][col]
                    );
                }
            }
        }

        // 操作中のぷよ描画
        if (this.currentPuyo) {
            const pos = this.getPuyoPositions();
            this.drawPuyoCircle(
                this.ctx,
                pos[0].x * CELL_SIZE + CELL_SIZE / 2,
                pos[0].y * CELL_SIZE + CELL_SIZE / 2,
                this.currentPuyo.color1
            );
            this.drawPuyoCircle(
                this.ctx,
                pos[1].x * CELL_SIZE + CELL_SIZE / 2,
                pos[1].y * CELL_SIZE + CELL_SIZE / 2,
                this.currentPuyo.color2
            );
        }

        // グリッド線
        this.ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= COLS; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * CELL_SIZE, 0);
            this.ctx.lineTo(i * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * CELL_SIZE);
            this.ctx.lineTo(COLS * CELL_SIZE, i * CELL_SIZE);
            this.ctx.stroke();
        }

        // オーバーレイ表示
        if (this.showReady) {
            this._drawOverlay('#FFD700', 'READY', 48);
        }
        if (this.showWin) {
            this._drawOverlay('#FFD700', 'WIN', 48);
        }
        if (this.showLose) {
            this._drawOverlay('#888888', 'LOSE', 48);
        }
        if (this.showTazen) {
            this._drawOverlay('#FFD700', 'WIN', 48, '当然ですわ');
        }
        if (this.showGununu) {
            this._drawOverlay('#888888', 'LOSE', 48, 'ぐぬぬ…');
        }
    }

    /** オーバーレイ（WIN / LOSE / READY など）を描画する共通ヘルパー */
    _drawOverlay(color, mainText, mainSize, subText = null) {
        const cx = (COLS * CELL_SIZE) / 2;
        const cy = (ROWS * CELL_SIZE) / 3;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);

        this.ctx.fillStyle = color;
        this.ctx.font = `bold ${mainSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(mainText, cx, cy);

        if (subText) {
            this.ctx.font = 'bold 24px Arial';
            this.ctx.fillText(subText, cx, cy + mainSize * 0.9);
        }
    }

    getPuyoPositions() {
        const p = this.currentPuyo;
        const positions = [{ x: p.x, y: p.y }];
        switch (p.rotation) {
            case 0: positions.push({ x: p.x, y: p.y - 1 }); break; // 上
            case 1: positions.push({ x: p.x + 1, y: p.y }); break; // 右
            case 2: positions.push({ x: p.x, y: p.y + 1 }); break; // 下
            case 3: positions.push({ x: p.x - 1, y: p.y }); break; // 左
        }
        return positions;
    }

    canMove(dx, dy, rotation = this.currentPuyo.rotation) {
        const testPuyo = { ...this.currentPuyo, x: this.currentPuyo.x + dx, y: this.currentPuyo.y + dy, rotation };
        const positions = this.getPuyoPositionsFor(testPuyo);
        for (const pos of positions) {
            if (pos.x < 0 || pos.x >= COLS || pos.y >= ROWS) return false;
            if (pos.y >= 0 && this.board[pos.y][pos.x] !== 0) return false;
        }
        return true;
    }

    getPuyoPositionsFor(puyo) {
        const positions = [{ x: puyo.x, y: puyo.y }];
        switch (puyo.rotation) {
            case 0: positions.push({ x: puyo.x, y: puyo.y - 1 }); break;
            case 1: positions.push({ x: puyo.x + 1, y: puyo.y }); break;
            case 2: positions.push({ x: puyo.x, y: puyo.y + 1 }); break;
            case 3: positions.push({ x: puyo.x - 1, y: puyo.y }); break;
        }
        return positions;
    }

    moveLeft() {
        if (this.currentPuyo && this.canMove(-1, 0)) {
            this.currentPuyo.x--;
            this.draw();
        }
    }

    moveRight() {
        if (this.currentPuyo && this.canMove(1, 0)) {
            this.currentPuyo.x++;
            this.draw();
        }
    }

    rotate(clockwise = true) {
        if (!this.currentPuyo) return;

        const newRotation = clockwise
            ? (this.currentPuyo.rotation + 1) % 4
            : (this.currentPuyo.rotation + 3) % 4;

        // 縦向き時に左右が両方塞がれている場合は上下入れ替え
        if (this.currentPuyo.rotation === 0 || this.currentPuyo.rotation === 2) {
            const leftBlocked = this.currentPuyo.x === 0 ||
                (this.currentPuyo.y >= 0 && this.board[this.currentPuyo.y]?.[this.currentPuyo.x - 1] !== 0);
            const rightBlocked = this.currentPuyo.x === COLS - 1 ||
                (this.currentPuyo.y >= 0 && this.board[this.currentPuyo.y]?.[this.currentPuyo.x + 1] !== 0);

            if (leftBlocked && rightBlocked) {
                [this.currentPuyo.color1, this.currentPuyo.color2] = [this.currentPuyo.color2, this.currentPuyo.color1];
                this.draw();
                return;
            }
        }

        // 通常回転
        if (this.canMove(0, 0, newRotation)) {
            this.currentPuyo.rotation = newRotation;
            this.draw();
            return;
        }

        // 壁蹴り（±1, ±2 マス試行）
        for (const offset of [1, -1, 2, -2]) {
            if (this.canMove(offset, 0, newRotation)) {
                this.currentPuyo.x += offset;
                this.currentPuyo.rotation = newRotation;
                this.draw();
                return;
            }
        }
    }

    async fall() {
        if (!this.currentPuyo) return;
        if (this.canMove(0, 1)) {
            this.currentPuyo.y++;
            this.draw();
        } else {
            await this.lockPuyo();
        }
    }

    async lockPuyo() {
        const positions = this.getPuyoPositions();

        // 横向きの場合は各ぷよを独立して配置
        if (this.currentPuyo.rotation === 1 || this.currentPuyo.rotation === 3) {
            const [pos1, pos2] = positions;
            if (pos1.y >= 0) this.board[pos1.y][pos1.x] = this.currentPuyo.color1;
            if (pos2.y >= 0) this.board[pos2.y][pos2.x] = this.currentPuyo.color2;
        } else {
            const [pos0, pos1] = positions;
            if (pos0.y >= 0) this.board[pos0.y][pos0.x] = this.currentPuyo.color1;
            if (pos1.y >= 0) this.board[pos1.y][pos1.x] = this.currentPuyo.color2;
        }

        this.currentPuyo = null;
        this.fastFall = false;
        this.stopFallTimer();

        await this.applyGravity();

        if (this.board[0][2] !== 0) {
            this.gameOver = true;
        }

        await this.processChains();
    }

    async processChains() {
        let chain = 0;
        const chainData = [];

        while (true) {
            if (this.gameOver) return;

            const clearedData = this.clearConnected();
            if (clearedData.totalCleared === 0) break;

            chain++;
            chainData.push({
                chain,
                puyoCount: clearedData.totalCleared,
                groupSizes: clearedData.groupSizes,
                colorCount: clearedData.colorCount,
            });

            this.score += clearedData.totalCleared * 10 * chain;
            this.updateScore();

            await this.animateClearing();
            await this.applyGravity();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (this.gameOver) return;

        // おじゃまぷよ計算・送信
        if (chain > 0) {
            let totalScore = 0;
            for (const data of chainData) {
                const chainBonus = this.getChainBonus(data.chain);
                const maxGroupSize = Math.max(...data.groupSizes);
                const connectionBonus = this.getConnectionBonus(maxGroupSize);
                const colorBonus = this.getColorBonus(data.colorCount);
                const bonusSum = Math.max(1, chainBonus + connectionBonus + colorBonus);
                totalScore += data.puyoCount * bonusSum * 10;
            }

            let ojamaCount = Math.floor(totalScore / 70);

            // 受け取り待ちと相殺
            if (this.pendingOjama > 0) {
                const offsetted = Math.min(this.pendingOjama, ojamaCount);
                this.pendingOjama -= offsetted;
                ojamaCount -= offsetted;
                this.updateOjamaIndicator();
            }

            if (ojamaCount > 0 && this.opponent) {
                this.opponent.pendingOjama += ojamaCount;
                this.opponent.updateOjamaIndicator();
            }
        }

        if (this.pendingOjama > 0 && !this.gameOver) {
            await this.dropOjama();
        }

        if (!this.gameOver) {
            await new Promise(resolve => setTimeout(resolve, SPAWN_DELAY));
            if (!this.gameOver) {
                const spawned = this.spawnPuyo();
                if (spawned && !this.gameOver) {
                    this.draw();
                    if (this.isPlayer) this.startFallTimer();
                }
            }
        }
    }

    updateOjamaIndicator() {
        if (this.pendingOjama > 0) {
            this.ojamaCountElement.textContent = this.pendingOjama;
            this.ojamaIndicator.classList.add('active');
        } else {
            this.ojamaIndicator.classList.remove('active');
        }
    }

    async dropOjama() {
        if (this.pendingOjama === 0) return;

        await new Promise(resolve => setTimeout(resolve, 1000));

        // 1回に落とすおじゃまぷよの上限は30個
        const ojamaCount = Math.min(this.pendingOjama, 30);
        this.pendingOjama -= ojamaCount;
        this.updateOjamaIndicator();

        // 列順をシャッフル
        const colOrder = Array.from({ length: COLS }, (_, i) => i);
        for (let i = colOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colOrder[i], colOrder[j]] = [colOrder[j], colOrder[i]];
        }

        // 各おじゃまぷよの落下先を決定
        const targetPositions = [];
        let placedCount = 0;
        let colIndex = 0;
        const maxAttempts = COLS * ROWS;
        let attempts = 0;

        while (placedCount < ojamaCount && attempts < maxAttempts) {
            const col = colOrder[colIndex % COLS];
            let foundSpace = false;
            for (let row = ROWS - 1; row >= 0; row--) {
                if (this.board[row][col] === 0 && !targetPositions.some(p => p.col === col && p.targetRow === row)) {
                    targetPositions.push({ col, targetRow: row });
                    placedCount++;
                    foundSpace = true;
                    break;
                }
            }
            if (!foundSpace) attempts++;
            colIndex++;
            if (colIndex >= COLS && !foundSpace) break;
        }

        if (targetPositions.length === 0) {
            this.gameOver = true;
            return;
        }

        // 落下アニメーション
        const totalFrames = Math.max(20, Math.min(ojamaCount * 2, 100));
        for (let frame = 0; frame < totalFrames; frame++) {
            for (const pos of targetPositions) {
                const progress = Math.pow((frame + 1) / totalFrames, 1.5);
                const currentRow = Math.floor(progress * (pos.targetRow + 1));

                if (frame > 0) {
                    const prevProgress = Math.pow(frame / totalFrames, 1.5);
                    const prevRow = Math.floor(prevProgress * (pos.targetRow + 1));
                    if (prevRow < pos.targetRow && this.board[prevRow][pos.col] === OJAMA_COLOR) {
                        if (!targetPositions.some(p => p.targetRow === prevRow && p.col === pos.col)) {
                            this.board[prevRow][pos.col] = 0;
                        }
                    }
                }

                if (currentRow <= pos.targetRow) {
                    this.board[currentRow][pos.col] = OJAMA_COLOR;
                }
            }

            this.draw();
            const delay = Math.max(5, 20 - frame * 0.2);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        for (const pos of targetPositions) {
            this.board[pos.targetRow][pos.col] = OJAMA_COLOR;
        }

        this.draw();
        await new Promise(resolve => setTimeout(resolve, 300));

        if (this.board[0][2] !== 0) {
            this.gameOver = true;
        }
    }

    clearConnected() {
        const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        let totalCleared = 0;
        const toClear = [];
        const groupSizes = [];
        const colorsUsed = new Set();

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (this.board[row][col] !== 0 && this.board[row][col] !== OJAMA_COLOR && !visited[row][col]) {
                    const color = this.board[row][col];
                    const group = this.findConnectedGroup(row, col, color, visited);
                    if (group.length >= 4) {
                        toClear.push(...group);
                        totalCleared += group.length;
                        groupSizes.push(group.length);
                        colorsUsed.add(color);
                        for (const pos of group) {
                            this.clearAdjacentOjama(pos.row, pos.col, toClear);
                        }
                    }
                }
            }
        }

        for (const pos of toClear) {
            this.board[pos.row][pos.col] = 0;
        }

        return {
            totalCleared,
            groupSizes: groupSizes.length > 0 ? groupSizes : [0],
            colorCount: colorsUsed.size,
        };
    }

    clearAdjacentOjama(row, col, toClear) {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && this.board[nr][nc] === OJAMA_COLOR) {
                if (!toClear.some(p => p.row === nr && p.col === nc)) {
                    toClear.push({ row: nr, col: nc });
                }
            }
        }
    }

    findConnectedGroup(row, col, color, visited) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return [];
        if (visited[row][col] || this.board[row][col] !== color) return [];
        visited[row][col] = true;
        const group = [{ row, col }];
        group.push(...this.findConnectedGroup(row - 1, col, color, visited));
        group.push(...this.findConnectedGroup(row + 1, col, color, visited));
        group.push(...this.findConnectedGroup(row, col - 1, color, visited));
        group.push(...this.findConnectedGroup(row, col + 1, color, visited));
        return group;
    }

    async animateClearing() {
        return new Promise(resolve => {
            this.draw();
            setTimeout(resolve, 400);
        });
    }

    async applyGravity() {
        let moved = true;
        while (moved) {
            moved = false;
            for (let row = ROWS - 2; row >= 0; row--) {
                for (let col = 0; col < COLS; col++) {
                    if (this.board[row][col] !== 0 && this.board[row + 1][col] === 0) {
                        this.board[row + 1][col] = this.board[row][col];
                        this.board[row][col] = 0;
                        moved = true;
                    }
                }
            }
            if (moved) {
                this.draw();
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        this.draw();
    }

    updateScore() {
        this.scoreElement.textContent = String(this.score).padStart(7, '0');
    }

    startFallTimer() {
        this.fallTimer = setInterval(async () => {
            await this.fall();
        }, this.fastFall ? FAST_FALL_SPEED : FALL_SPEED);
    }

    stopFallTimer() {
        if (this.fallTimer) {
            clearInterval(this.fallTimer);
            this.fallTimer = null;
        }
    }

    // ===== ボーナス計算テーブル =====

    getChainBonus(chain) {
        const bonuses = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
        return chain < bonuses.length ? bonuses[chain] : 512;
    }

    getConnectionBonus(count) {
        if (count <= 4) return 0;
        if (count === 5) return 2;
        if (count === 6) return 3;
        if (count === 7) return 4;
        if (count === 8) return 5;
        if (count === 9) return 6;
        if (count === 10) return 7;
        return 10;
    }

    getColorBonus(colorCount) {
        const table = [0, 0, 3, 6, 12, 24];
        return table[Math.min(colorCount, table.length - 1)] ?? 0;
    }
}
