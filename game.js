// ゲーム定数
const COLS = 6;
const ROWS = 12;
const CELL_SIZE = 40; // 32から40に拡大
const COLORS = ['red', 'blue', 'green', 'yellow'];
const FALL_SPEED = 800; // ms (遅く調整)
const FAST_FALL_SPEED = 50; // ms (最速落下)
const SPAWN_DELAY = 200; // ms (次のぷよ落下までのディレイ)
const OJAMA_COLOR = 'gray'; // おじゃまぷよの色

// ぷよ画像の読み込み
const puyoImages = {};
const imageNames = ['red', 'blue', 'green', 'yellow', 'gray'];
let imagesLoaded = 0;

imageNames.forEach(name => {
    const img = new Image();
    img.src = `${name}.png`;
    img.onload = () => {
        imagesLoaded++;
    };
    puyoImages[name] = img;
});

// ゲーム状態
class GameState {
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
        this.pendingOjama = 0; // 受け取り待ちのおじゃまぷよ数
        this.opponent = null; // 対戦相手への参照
        
        this.currentPuyo = null;
        this.nextPuyo1 = this.generatePuyo();
        this.nextPuyo2 = this.generatePuyo();
        this.fallTimer = null;
        this.fastFall = false;
        this.spawning = false; // 新しいぷよ生成中フラグ
        this.showReady = false; // READY表示フラグ
        this.showWin = false; // WIN表示フラグ
        this.showLose = false; // LOSE表示フラグ
        this.showTazen = false; // 「当然ですわ」表示フラグ
        this.showGununu = false; // 「ぐぬぬ...」表示フラグ
    }

    generatePuyo() {
        const color1 = COLORS[Math.floor(Math.random() * COLORS.length)];
        const color2 = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x: 2,
            y: 0,
            color1: color1,
            color2: color2,
            rotation: 0 // 0: 上, 1: 右, 2: 下, 3: 左
        };
    }

    spawnPuyo() {
        // nextPuyo1をcurrentに、nextPuyo2をnextPuyo1に、新しいぷよをnextPuyo2に
        this.currentPuyo = {...this.nextPuyo1, x: 2, y: 0}; // 位置をリセット
        this.nextPuyo1 = this.nextPuyo2;
        this.nextPuyo2 = this.generatePuyo();
        this.drawNext();
        
        // スポーン位置の両方のセルをチェック（rotation=0の場合、y=0とy=-1）
        // y=-1は画面外なので、y=0のみチェックすればOK
        // 但し、ふたつのぷよが配置できるかどうかを正確に確認
        const positions = this.getPuyoPositions();
        const canSpawn = positions.every(pos => {
            // 画面外のy<0はOK
            if (pos.y < 0) return true;
            // 画面内の場合、そのセルが空であること
            return this.board[pos.y][pos.x] === 0;
        });
        
        if (!canSpawn) {
            // 負け判定は3列目(col=2)の12段目(row=0)にぷよがある場合のみ
            if (this.board[0][2] !== 0) {
                this.gameOver = true;
            }
            return false;
        }
        return true;
    }

    drawNext() {
        // NEXT 1 - 縦に並べる（上がcolor2、下がcolor1）
        this.nextCtx1.clearRect(0, 0, this.nextCanvas1.width, this.nextCanvas1.height);
        this.drawPuyoCircle(this.nextCtx1, 30, 25, this.nextPuyo1.color2);
        this.drawPuyoCircle(this.nextCtx1, 30, 60, this.nextPuyo1.color1);
        
        // NEXT 2 - 縦に並べる（上がcolor2、下がcolor1）
        this.nextCtx2.clearRect(0, 0, this.nextCanvas2.width, this.nextCanvas2.height);
        this.drawPuyoCircle(this.nextCtx2, 30, 25, this.nextPuyo2.color2);
        this.drawPuyoCircle(this.nextCtx2, 30, 60, this.nextPuyo2.color1);
    }

    drawPuyoCircle(ctx, x, y, color) {
        const width = 100;  // 横幅
        const height = 45; // 高さ
        
        // 画像が読み込まれている場合は画像を描画
        if (puyoImages[color] && puyoImages[color].complete) {
            ctx.drawImage(
                puyoImages[color],
                x - width / 2,
                y - height / 2,
                width,
                height
            );
        } else {
            // 画像が読み込まれていない場合は従来の円を描画
            const radius = 15;
            
            // 影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // メイン - おじゃまぷよの場合は濃いグレーにする
            ctx.fillStyle = color === OJAMA_COLOR ? '#666666' : color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // おじゃまぷよの場合は×印を描画
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
                // ハイライト
                const gradient = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                // 目
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
        
        // 最上段左から3番目に×マークを表示（ぷよの後ろ側）
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
        
        // 現在のぷよ描画
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
        
        // READY表示
        if (this.showReady) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('READY', (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 3);
        }
        
        // WIN表示
        if (this.showWin) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('WIN', (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 3);
        }
        
        // LOSE表示
        if (this.showLose) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.fillStyle = '#888888';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('LOSE', (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 3);
        }
        
        // 「当然ですわ」表示
        if (this.showTazen) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 32px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('WIN', (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 3);
        }
        
        // 「ぐぬぬ...」表示
        if (this.showGununu) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE);
            this.ctx.fillStyle = '#888888';
            this.ctx.font = 'bold 32px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('LOSE', (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 3);
        }
    }

    getPuyoPositions() {
        const p = this.currentPuyo;
        const positions = [{x: p.x, y: p.y}];
        
        switch (p.rotation) {
            case 0: positions.push({x: p.x, y: p.y - 1}); break; // 上
            case 1: positions.push({x: p.x + 1, y: p.y}); break; // 右
            case 2: positions.push({x: p.x, y: p.y + 1}); break; // 下
            case 3: positions.push({x: p.x - 1, y: p.y}); break; // 左
        }
        
        return positions;
    }

    canMove(dx, dy, rotation = this.currentPuyo.rotation) {
        const testPuyo = {...this.currentPuyo, x: this.currentPuyo.x + dx, y: this.currentPuyo.y + dy, rotation};
        const positions = this.getPuyoPositionsFor(testPuyo);
        
        for (let pos of positions) {
            if (pos.x < 0 || pos.x >= COLS || pos.y >= ROWS) return false;
            if (pos.y >= 0 && this.board[pos.y][pos.x] !== 0) return false;
        }
        return true;
    }

    getPuyoPositionsFor(puyo) {
        const positions = [{x: puyo.x, y: puyo.y}];
        switch (puyo.rotation) {
            case 0: positions.push({x: puyo.x, y: puyo.y - 1}); break;
            case 1: positions.push({x: puyo.x + 1, y: puyo.y}); break;
            case 2: positions.push({x: puyo.x, y: puyo.y + 1}); break;
            case 3: positions.push({x: puyo.x - 1, y: puyo.y}); break;
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
        
        // 両サイドが壁の場合は上下入れ替え（rotation 0 → 2 または 2 → 0）
        if (this.currentPuyo.rotation === 0 || this.currentPuyo.rotation === 2) {
            // 左右に壁がある場合（x=0またはx=COLS-1、または両隣にぷよがある）
            const leftBlocked = this.currentPuyo.x === 0 || 
                               (this.currentPuyo.y >= 0 && this.board[this.currentPuyo.y] && this.board[this.currentPuyo.y][this.currentPuyo.x - 1] !== 0);
            const rightBlocked = this.currentPuyo.x === COLS - 1 || 
                                (this.currentPuyo.y >= 0 && this.board[this.currentPuyo.y] && this.board[this.currentPuyo.y][this.currentPuyo.x + 1] !== 0);
            
            if (leftBlocked && rightBlocked) {
                // 上下入れ替え（color1とcolor2を入れ替える）
                const temp = this.currentPuyo.color1;
                this.currentPuyo.color1 = this.currentPuyo.color2;
                this.currentPuyo.color2 = temp;
                this.draw();
                return;
            }
        }
        
        // まず通常の回転を試す
        if (this.canMove(0, 0, newRotation)) {
            this.currentPuyo.rotation = newRotation;
            this.draw();
            return;
        }
        
        // 壁にぶつかる場合、押し戻しを試す
        // 左に1マス、右に1マス、左に2マス、右に2マス試す
        const offsets = [1, -1, 2, -2];
        for (let offset of offsets) {
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
        
        // 横向き（rotation 1 or 3）の場合、両方のぷよを個別に落下させる
        if (this.currentPuyo.rotation === 1 || this.currentPuyo.rotation === 3) {
            // 2つのぷよをそれぞれ落下させる
            const pos1 = positions[0];
            const pos2 = positions[1];
            
            // まず現在位置に配置
            if (pos1.y >= 0) this.board[pos1.y][pos1.x] = this.currentPuyo.color1;
            if (pos2.y >= 0) this.board[pos2.y][pos2.x] = this.currentPuyo.color2;
            
            this.currentPuyo = null;
            this.fastFall = false;
            this.stopFallTimer();
            
            // 落下アニメーション
            await this.applyGravity();
            
            // 負け判定: 3列目(col=2)の12段目(row=0)にぷよがある場合のみ
            if (this.board[0][2] !== 0) {
                this.gameOver = true;
            }
        } else {
            // 縦向きの場合は従来通り
            const finalPos0 = positions[0];
            const finalPos1 = positions[1];
            
            // ぷよを配置
            if (finalPos0.y >= 0) this.board[finalPos0.y][finalPos0.x] = this.currentPuyo.color1;
            if (finalPos1.y >= 0) this.board[finalPos1.y][finalPos1.x] = this.currentPuyo.color2;
            
            this.currentPuyo = null;
            this.fastFall = false;
            this.stopFallTimer();
            
            // 負け判定: 3列目(col=2)の12段目(row=0)にぷよがある場合のみ
            if (this.board[0][2] !== 0) {
                this.gameOver = true;
            }
        }
        
        await this.processChains();
    }

    async processChains() {
        let chain = 0;
        let totalCleared = 0;
        let chainData = []; // 各連鎖のデータを保存
        
        while (true) {
            // ゲームオーバーチェックを追加
            if (this.gameOver) {
                return; // 早期リターンで確実に処理を停止
            }
            
            const clearedData = this.clearConnected();
            if (clearedData.totalCleared === 0) break;
            
            chain++;
            totalCleared += clearedData.totalCleared;
            
            // 各連鎖のデータを保存
            chainData.push({
                chain: chain,
                puyoCount: clearedData.totalCleared,
                groupSizes: clearedData.groupSizes,
                colorCount: clearedData.colorCount
            });
            
            this.score += clearedData.totalCleared * 10 * chain;
            this.updateScore();
            
            await this.animateClearing();
            await this.applyGravity();
            
            // 連鎖ごとにディレイを追加（500ms）
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // ゲームオーバーの場合は以降の処理をスキップ
        if (this.gameOver) {
            return;
        }
        
        // 連鎖が発生した場合、おじゃまぷよを計算して相殺し、余剰分を送る
        if (chain > 0) {
            // おじゃまぷよ数を新しい計算式で算出
            let totalScore = 0;
            
            for (let data of chainData) {
                // 連鎖ボーナス
                const chainBonus = this.getChainBonus(data.chain);
                
                // 連結ボーナス（各グループの最大値を使用）
                const maxGroupSize = Math.max(...data.groupSizes);
                const connectionBonus = this.getConnectionBonus(maxGroupSize);
                
                // 色数ボーナス
                const colorBonus = this.getColorBonus(data.colorCount);
                
                // ボーナス合計（最低1）
                const bonusSum = Math.max(1, chainBonus + connectionBonus + colorBonus);
                
                // スコア計算
                const score = data.puyoCount * bonusSum * 10;
                totalScore += score;
            }
            
            // 70点につき1個のおじゃまぷよ
            let ojamaCount = Math.floor(totalScore / 70);
            
            // 受け取り待ちのおじゃまぷよがあれば相殺
            if (this.pendingOjama > 0) {
                const offsetted = Math.min(this.pendingOjama, ojamaCount);
                this.pendingOjama -= offsetted;
                ojamaCount -= offsetted;
                this.updateOjamaIndicator();
            }
            
            // 余剰分を相手に送る
            if (ojamaCount > 0) {
                this.opponent.pendingOjama += ojamaCount;
                this.opponent.updateOjamaIndicator();
            }
        }
        
        // おじゃまぷよを降らせる（1回30個まで、超える場合は次のターンに持ち越し）
        if (this.pendingOjama > 0 && !this.gameOver) {
            await this.dropOjama();
        }
        
        // ゲームオーバーでない場合のみ次のぷよをスポーン
        if (!this.gameOver) {
            // ディレイを入れて次のぷよをスポーン
            await new Promise(resolve => setTimeout(resolve, SPAWN_DELAY));
            if (!this.gameOver) {
                const spawned = this.spawnPuyo();
                if (spawned && !this.gameOver) {
                    this.draw();
                    if (this.isPlayer) {
                        this.startFallTimer(); // プレイヤーの場合は自動落下を開始
                    }
                }
            }
        }
    }
    
    sendOjama(chain) {
        if (!this.opponent) return;
        
        // 連鎖数に応じておじゃまぷよを計算 (1連鎖=1個、2連鎖=3個、3連鎖=6個...)
        let ojamaCount = 0;
        for (let i = 1; i <= chain; i++) {
            ojamaCount += i;
        }
        
        this.opponent.pendingOjama += ojamaCount;
        this.opponent.updateOjamaIndicator();
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
        
        // おじゃま告知を少し表示
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 1回に落とすおじゃまぷよの上限2030個に制限
        const ojamaCount = Math.min(this.pendingOjama, 30);
        this.pendingOjama -= ojamaCount;
        this.updateOjamaIndicator();
        
        // 各列に均等におじゃまぷよを配置
        const colOrder = [];
        for (let col = 0; col < COLS; col++) {
            colOrder.push(col);
        }
        // 列順をシャッフル
        for (let i = colOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colOrder[i], colOrder[j]] = [colOrder[j], colOrder[i]];
        }
        
        // 各列の最終位置を計算
        const targetPositions = [];
        let placedCount = 0;
        let colIndex = 0;
        
        // 盤面に配置可能な最大数をチェック（無限ループ防止）
        let maxAttempts = COLS * ROWS;
        let attempts = 0;
        
        while (placedCount < ojamaCount && attempts < maxAttempts) {
            const col = colOrder[colIndex % COLS];
            
            // 空いている最下行を見つける
            let foundSpace = false;
            for (let row = ROWS - 1; row >= 0; row--) {
                if (this.board[row][col] === 0 && !targetPositions.some(p => p.col === col && p.targetRow === row)) {
                    targetPositions.push({col: col, targetRow: row});
                    placedCount++;
                    foundSpace = true;
                    break;
                }
            }
            
            // この列に空きがなかった場合、次の列へ
            if (!foundSpace) {
                attempts++;
            }
            
            colIndex++;
            
            // 全ての列を試しても空きがない場合は終了
            if (colIndex >= COLS && !foundSpace) {
                break;
            }
        }
        
        // 配置できるおじゃまぷよがない場合はゲームオーバー
        if (targetPositions.length === 0) {
            this.gameOver = true;
            return;
        }
        
        // 最大の落下距離を計算
        const maxDistance = Math.max(...targetPositions.map(p => p.targetRow + 1));
        
        // お邪魔ぷよの個数分だけフレーム数を使う（最小20フレーム、最大100フレーム）
        const totalFrames = Math.max(20, Math.min(ojamaCount * 2, 100));
        
        // すべてのお邪魔ぷよを同時に上から降らせる（重力加速度付き）
        for (let frame = 0; frame < totalFrames; frame++) {
            // 各お邪魔ぷよの現在位置を計算
            for (const pos of targetPositions) {
                // 重力加速度を使った進行度の計算（二次関数的に加速）
                const progress = Math.pow((frame + 1) / totalFrames, 1.5);
                const currentRow = Math.floor(progress * (pos.targetRow + 1));
                
                // 前の位置をクリア
                if (frame > 0) {
                    const prevProgress = Math.pow(frame / totalFrames, 1.5);
                    const prevRow = Math.floor(prevProgress * (pos.targetRow + 1));
                    if (prevRow < pos.targetRow && this.board[prevRow][pos.col] === OJAMA_COLOR) {
                        // 他のお邪魔ぷよの最終位置でないか確認
                        const isOtherTarget = targetPositions.some(p => p.targetRow === prevRow && p.col === pos.col);
                        if (!isOtherTarget) {
                            this.board[prevRow][pos.col] = 0;
                        }
                    }
                }
                
                // 現在の位置に描画
                if (currentRow <= pos.targetRow) {
                    this.board[currentRow][pos.col] = OJAMA_COLOR;
                }
            }
            
            this.draw();
            // フレーム間の待ち時間を徐々に短くする（初速を速く、徐々に減速）
            const delay = Math.max(5, 20 - frame * 0.2);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // 最終的な配置を確定
        for (const pos of targetPositions) {
            this.board[pos.targetRow][pos.col] = OJAMA_COLOR;
        }
        
        this.draw();
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // おじゃまぷよを降らせた後、ゲームオーバーチェック
        // 負け判定: 3列目(col=2)の12段目(row=0)にぷよがある場合のみ
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
                        
                        // 隣接するおじゃまぷよも消す
                        for (let pos of group) {
                            this.clearAdjacentOjama(pos.row, pos.col, toClear);
                        }
                    }
                }
            }
        }
        
        // クリア
        for (let pos of toClear) {
            this.board[pos.row][pos.col] = 0;
        }
        
        return {
            totalCleared: totalCleared,
            groupSizes: groupSizes.length > 0 ? groupSizes : [0],
            colorCount: colorsUsed.size
        };
    }
    
    clearAdjacentOjama(row, col, toClear) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
                if (this.board[newRow][newCol] === OJAMA_COLOR) {
                    const alreadyMarked = toClear.some(p => p.row === newRow && p.col === newCol);
                    if (!alreadyMarked) {
                        toClear.push({row: newRow, col: newCol});
                    }
                }
            }
        }
    }

    findConnectedGroup(row, col, color, visited) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return [];
        if (visited[row][col] || this.board[row][col] !== color) return [];
        
        visited[row][col] = true;
        let group = [{row, col}];
        
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
            // 下から上へ走査して、落下可能なぷよを見つける
            for (let row = ROWS - 2; row >= 0; row--) {
                for (let col = 0; col < COLS; col++) {
                    if (this.board[row][col] !== 0 && this.board[row + 1][col] === 0) {
                        this.board[row + 1][col] = this.board[row][col];
                        this.board[row][col] = 0;
                        moved = true;
                    }
                }
            }
            // 1マス落下するたびに描画とディレイ
            if (moved) {
                this.draw();
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // 重力適用後、もう一度描画して確実に更新
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

    getChainBonus(chain) {
        const bonuses = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
        return chain < bonuses.length ? bonuses[chain] : 512;
    }

    getConnectionBonus(count) {
        if (count === 4) return 0;
        if (count === 5) return 2;
        if (count === 6) return 3;
        if (count === 7) return 4;
        if (count === 8) return 5;
        if (count === 9) return 6;
        if (count === 10) return 7;
        return 10; // 11個以上
    }

    getColorBonus(colorCount) {
        if (colorCount === 1) return 0;
        if (colorCount === 2) return 3;
        if (colorCount === 3) return 6;
        if (colorCount === 4) return 12;
        if (colorCount === 5) return 24;
        return 0;
    }
}

// CPUプレイヤー
class CPUPlayer {
    constructor(gameState, difficulty = 'normal') {
        this.gameState = gameState;
        this.difficulty = difficulty; // 'easy', 'normal', 'hard'
    }

    async makeMove() {
        if (!this.gameState.currentPuyo || this.gameState.gameOver) return;
        
        // 難易度に応じた待機時間
        const thinkTime = this.difficulty === 'easy' ? 500 : this.difficulty === 'normal' ? 300 : 200;
        await new Promise(resolve => setTimeout(resolve, thinkTime));
        
        const bestMove = this.findBestMove();
        
        // 回転
        for (let i = 0; i < bestMove.rotation; i++) {
            this.gameState.rotate(true);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 移動
        const currentX = this.gameState.currentPuyo.x;
        const moves = bestMove.x - currentX;
        for (let i = 0; i < Math.abs(moves); i++) {
            if (moves > 0) {
                this.gameState.moveRight();
            } else {
                this.gameState.moveLeft();
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 高速落下
        while (this.gameState.canMove(0, 1)) {
            await this.gameState.fall();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await this.gameState.lockPuyo();
    }

    findBestMove() {
        let bestScore = -Infinity;
        let bestMove = {x: 2, rotation: 0};
        
        // 全ての可能な配置を試す
        for (let rotation = 0; rotation < 4; rotation++) {
            for (let x = 0; x < COLS; x++) {
                const score = this.evaluateMove(x, rotation);
                
                // 難易度「よわい」の場合、ランダム性を追加
                const finalScore = this.difficulty === 'easy' ? score + Math.random() * 200 - 100 : score;
                
                if (finalScore > bestScore) {
                    bestScore = finalScore;
                    bestMove = {x, rotation};
                }
            }
        }
        
        return bestMove;
    }

    evaluateMove(x, rotation) {
        // シミュレーションボードを作成
        const simBoard = this.gameState.board.map(row => [...row]);
        const testPuyo = {...this.gameState.currentPuyo, x, rotation, y: 0};
        
        // 落下位置を計算
        while (this.canMoveInSim(testPuyo, simBoard, 0, 1)) {
            testPuyo.y++;
        }
        
        // ぷよを配置
        const positions = this.gameState.getPuyoPositionsFor(testPuyo);
        if (positions.some(pos => pos.y < 0 || pos.x < 0 || pos.x >= COLS)) {
            return -Infinity;
        }
        
        simBoard[positions[0].y][positions[0].x] = testPuyo.color1;
        simBoard[positions[1].y][positions[1].x] = testPuyo.color2;
        
        // 難易度に応じた評価
        return this.difficulty === 'easy' ? this.evaluateEasy(simBoard) :
               this.difficulty === 'normal' ? this.evaluateNormal(simBoard) :
               this.evaluateHard(simBoard);
    }

    evaluateEasy(board) {
        let score = 0;
        
        // シンプルな評価（高さと穴のみ）
        const height = this.getMaxHeight(board);
        score -= height * 5;
        
        const holes = this.countHoles(board);
        score -= holes * 10;
        
        return score;
    }

    evaluateNormal(board) {
        let score = 0;
        
        // 高さペナルティ
        const height = this.getMaxHeight(board);
        score -= height * 10;
        
        // 連結ボーナス
        score += this.countConnections(board) * 20;
        
        // 穴ペナルティ
        score -= this.countHoles(board) * 30;
        
        // 3連結ボーナス（4個消しの一歩手前）
        score += this.count3Connections(board) * 15;
        
        return score;
    }

    evaluateHard(board) {
        let score = 0;
        
        // 1. 連鎖可能性の評価（最重要）
        const chainPotential = this.evaluateChainPotential(board);
        score += chainPotential * 100;
        
        // 2. 即座に消える場合の評価（連鎖発火）
        const immediateChain = this.countImmediateChains(board);
        if (immediateChain > 0) {
            score += immediateChain * 500;
        }
        
        // 3. 同色の隣接数（連鎖の土台作り）
        score += this.countColorConnections(board) * 30;
        
        // 4. 高さペナルティ（低めに抑える）
        const height = this.getMaxHeight(board);
        score -= height * 5;
        
        // 5. 穴ペナルティ
        score -= this.countHoles(board) * 20;
        
        // 6. 3連結ボーナス（4個消しの一歩手前）
        score += this.count3Connections(board) * 40;
        
        return score;
    }

    canMoveInSim(puyo, board, dx, dy) {
        const testPuyo = {...puyo, x: puyo.x + dx, y: puyo.y + dy};
        const positions = this.gameState.getPuyoPositionsFor(testPuyo);
        
        for (let pos of positions) {
            if (pos.x < 0 || pos.x >= COLS || pos.y >= ROWS) return false;
            if (pos.y >= 0 && board[pos.y][pos.x] !== 0) return false;
        }
        return true;
    }

    getMaxHeight(board) {
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0) {
                    return ROWS - row;
                }
            }
        }
        return 0;
    }

    countConnections(board) {
        let connections = 0;
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0) {
                    const color = board[row][col];
                    if (row > 0 && board[row - 1][col] === color) connections++;
                    if (col > 0 && board[row][col - 1] === color) connections++;
                }
            }
        }
        return connections;
    }

    countHoles(board) {
        let holes = 0;
        for (let col = 0; col < COLS; col++) {
            let foundPuyo = false;
            for (let row = 0; row < ROWS; row++) {
                if (board[row][col] !== 0) {
                    foundPuyo = true;
                } else if (foundPuyo) {
                    holes++;
                }
            }
        }
        return holes;
    }

    // 連鎖可能性を評価（階段状の配置など）
    evaluateChainPotential(board) {
        let potential = 0;
        
        for (let col = 0; col < COLS; col++) {
            for (let row = ROWS - 1; row >= 0; row--) {
                if (board[row][col] === 0 || board[row][col] === OJAMA_COLOR) continue;
                
                const color = board[row][col];
                
                // 上に空間があり、その上に同色がある場合（連鎖の種）
                if (row > 1 && board[row - 1][col] === 0 && board[row - 2][col] === color) {
                    potential += 30;
                }
                
                // 横に同色が2個並んでいる場合
                let horizontalCount = 1;
                for (let dc = 1; dc < COLS - col && board[row][col + dc] === color; dc++) {
                    horizontalCount++;
                }
                if (horizontalCount === 3) potential += 25;
                if (horizontalCount === 2) potential += 10;
                
                // 縦に同色が2個並んでいる場合
                if (row < ROWS - 1 && board[row + 1][col] === color) {
                    potential += 15;
                }
            }
        }
        
        return potential;
    }

    // 即座に消える連鎖数をカウント
    countImmediateChains(board) {
        let chainCount = 0;
        const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0 && board[row][col] !== OJAMA_COLOR && !visited[row][col]) {
                    const color = board[row][col];
                    const group = this.findConnectedGroupInSim(board, row, col, color, visited);
                    if (group.length >= 4) {
                        chainCount++;
                    }
                }
            }
        }
        
        return chainCount;
    }

    // シミュレーションボードで連結グループを探す
    findConnectedGroupInSim(board, row, col, color, visited) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return [];
        if (visited[row][col] || board[row][col] !== color) return [];
        
        visited[row][col] = true;
        let group = [{row, col}];
        
        group.push(...this.findConnectedGroupInSim(board, row - 1, col, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row + 1, col, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row, col - 1, color, visited));
        group.push(...this.findConnectedGroupInSim(board, row, col + 1, color, visited));
        
        return group;
    }

    // 同色の隣接数をカウント
    countColorConnections(board) {
        let connections = 0;
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0 && board[row][col] !== OJAMA_COLOR) {
                    const color = board[row][col];
                    if (row > 0 && board[row - 1][col] === color) connections++;
                    if (col > 0 && board[row][col - 1] === color) connections++;
                }
            }
        }
        return connections;
    }

    // 3個連結をカウント（4個消しの一歩手前）
    count3Connections(board) {
        let count = 0;
        const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
        
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] !== 0 && board[row][col] !== OJAMA_COLOR && !visited[row][col]) {
                    const color = board[row][col];
                    const group = this.findConnectedGroupInSim(board, row, col, color, visited);
                    if (group.length === 3) {
                        count++;
                    }
                }
            }
        }
        
        return count;
    }
}

// ゲームマネージャー
class GameManager {
    constructor() {
        this.player1 = null;
        this.player2 = null;
        this.cpu = null;
        this.running = false;
        this.wins1 = 0;
        this.wins2 = 0;
        this.bgm = document.getElementById('bgm');
        this.setupControls();
    }

    setupControls() {
        document.getElementById('startBtn').addEventListener('click', () => {
            // BGMを再生
            if (this.bgm) {
                this.bgm.play().catch(e => {
                    console.log('BGM再生に失敗しました:', e);
                });
            }
            this.start();
        });
        
        document.addEventListener('keydown', (e) => {
            if (!this.running || !this.player1.currentPuyo) return;
            
            // キーリピート防止
            if (e.repeat && e.key === 'ArrowDown') return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    this.player1.moveLeft();
                    break;
                case 'ArrowRight':
                    this.player1.moveRight();
                    break;
                case 'ArrowDown':
                    if (!this.player1.fastFall) {
                        this.player1.fastFall = true;
                        this.player1.stopFallTimer();
                        this.player1.startFallTimer();
                    }
                    break;
                case 'z':
                case 'Z':
                    this.player1.rotate(false);
                    break;
                case 'x':
                case 'X':
                    this.player1.rotate(true);
                    break;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowDown' && this.player1) {
                this.player1.fastFall = false;
                this.player1.stopFallTimer();
                if (this.running && this.player1.currentPuyo) {
                    this.player1.startFallTimer();
                }
            }
        });
    }

    async start() {
        // 難易度を取得
        const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
        
        // 難易度選択を無効化
        document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
            radio.disabled = true;
        });
        
        // リセット
        this.player1 = new GameState(
            document.getElementById('board1'),
            document.getElementById('next1-1'),
            document.getElementById('next1-2'),
            document.getElementById('score1'),
            document.getElementById('ojama1'),
            document.getElementById('ojama1-count'),
            true
        );
        
        this.player2 = new GameState(
            document.getElementById('board2'),
            document.getElementById('next2-1'),
            document.getElementById('next2-2'),
            document.getElementById('score2'),
            document.getElementById('ojama2'),
            document.getElementById('ojama2-count'),
            false
        );
        
        // 対戦相手を設定
        this.player1.opponent = this.player2;
        this.player2.opponent = this.player1;
        
        this.cpu = new CPUPlayer(this.player2, difficulty);
        
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('gameOverText').classList.add('hidden');
        
        this.running = true;
        
        // おじゃまぷよの予告をクリア
        this.player1.updateOjamaIndicator();
        this.player2.updateOjamaIndicator();
        
        // READY表示前にNEXTを表示
        this.player1.drawNext();
        this.player2.drawNext();
        
        // READY表示
        this.player1.showReady = true;
        this.player2.showReady = true;
        this.player1.showWin = false;
        this.player2.showWin = false;
        this.player1.showLose = false;
        this.player2.showLose = false;
        this.player1.showTazen = false;
        this.player2.showTazen = false;
        this.player1.showGununu = false;
        this.player2.showGununu = false;
        this.player1.draw();
        this.player2.draw();
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        this.player1.showReady = false;
        this.player2.showReady = false;
        
        // プレイヤー1スタート
        this.player1.spawnPuyo();
        this.player1.draw();
        this.player1.startFallTimer();
        
        // プレイヤー2スタート
        this.player2.spawnPuyo();
        this.player2.draw();
        this.runCPU();
    }

    async runCPU() {
        while (this.running && !this.player2.gameOver) {
            if (this.player2.currentPuyo) {
                await this.cpu.makeMove();
            }
            
            if (!this.player2.gameOver && this.running) {
                this.player2.spawnPuyo();
                this.player2.draw();
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // ゲームオーバーチェック
            if (this.player1.gameOver || this.player2.gameOver) {
                this.endGame();
                break;
            }
        }
    }

    async endGame() {
        this.running = false;
        this.player1.stopFallTimer();
        this.player2.stopFallTimer();
        
        if (this.player1.gameOver && this.player2.gameOver) {
            // 引き分け - 次のゲームへ
            setTimeout(() => {
                this.start();
            }, 2000);
        } else if (this.player1.gameOver) {
            // CPUの勝利
            this.wins2++;
            this.updateWinStars();
            
            if (this.wins2 >= 2) {
                // 2本先取で最終勝利 - WIN/LOSE表示
                this.player2.showWin = true;
                this.player1.showLose = true;
                this.player2.draw();
                this.player1.draw();
                
                setTimeout(() => {
                    this.wins1 = 0;
                    this.wins2 = 0;
                    this.updateWinStars();
                    this.player2.showWin = false;
                    this.player1.showLose = false;
                    // 難易度選択を有効化
                    document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
                        radio.disabled = false;
                    });
                    document.getElementById('startBtn').style.display = 'block';
                }, 3000);
            } else {
                // 1本取っただけ - 「当然ですわ」「ぐぬぬ...」表示
                this.player2.showTazen = true;
                this.player1.showGununu = true;
                this.player2.draw();
                this.player1.draw();
                
                setTimeout(() => {
                    this.player2.showTazen = false;
                    this.player1.showGununu = false;
                    this.start();
                }, 2000);
            }
        } else {
            // プレイヤーの勝利
            this.wins1++;
            this.updateWinStars();
            
            if (this.wins1 >= 2) {
                // 2本先取で最終勝利 - WIN/LOSE表示
                this.player1.showWin = true;
                this.player2.showLose = true;
                this.player1.draw();
                this.player2.draw();
                
                setTimeout(() => {
                    this.wins1 = 0;
                    this.wins2 = 0;
                    this.updateWinStars();
                    this.player1.showWin = false;
                    this.player2.showLose = false;
                    // 難易度選択を有効化
                    document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
                        radio.disabled = false;
                    });
                    document.getElementById('startBtn').style.display = 'block';
                }, 3000);
            } else {
                // 1本取っただけ - 「当然ですわ」「ぐぬぬ...」表示
                this.player1.showTazen = true;
                this.player2.showGununu = true;
                this.player1.draw();
                this.player2.draw();
                
                setTimeout(() => {
                    this.player1.showTazen = false;
                    this.player2.showGununu = false;
                    this.start();
                }, 2000);
            }
        }
    }
    
    updateWinStars() {
        const player1Stars = document.getElementById('player1Stars');
        const player2Stars = document.getElementById('player2Stars');
        
        // プレイヤー1の星を更新
        if (this.wins1 === 0) {
            player1Stars.textContent = '☆☆';
        } else if (this.wins1 === 1) {
            player1Stars.textContent = '★☆';
        } else {
            player1Stars.textContent = '★★';
        }
        
        // プレイヤー2の星を更新
        if (this.wins2 === 0) {
            player2Stars.textContent = '☆☆';
        } else if (this.wins2 === 1) {
            player2Stars.textContent = '☆★';
        } else {
            player2Stars.textContent = '★★';
        }
    }
}

// ゲーム初期化
const game = new GameManager();
