import { GameState } from './gamestate.js';
import { CPUPlayer }  from './cpu.js';

class GameManager {
    constructor() {
        this.player1 = null;
        this.player2 = null;
        this.cpu     = null;
        this.running = false;
        this.wins1   = 0;
        this.wins2   = 0;
        this._setupControls();
    }

    _setupControls() {
        document.getElementById('startBtn').addEventListener('click', () => {
            this.start();
        });

        document.addEventListener('keydown', (e) => {
            if (!this.running || !this.player1.currentPuyo) return;
            if (e.repeat && e.key === 'ArrowDown') return;

            switch (e.key) {
                case 'ArrowLeft':  this.player1.moveLeft();  break;
                case 'ArrowRight': this.player1.moveRight(); break;
                case 'ArrowDown':
                    if (!this.player1.fastFall) {
                        this.player1.fastFall = true;
                        this.player1.stopFallTimer();
                        this.player1.startFallTimer();
                    }
                    break;
                case 'z': case 'Z': this.player1.rotate(false); break;
                case 'x': case 'X': this.player1.rotate(true);  break;
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
        const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';

        document.querySelectorAll('input[name="difficulty"]').forEach(r => r.disabled = true);

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

        this.player1.opponent = this.player2;
        this.player2.opponent = this.player1;

        this.cpu = new CPUPlayer(this.player2, difficulty);

        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('gameOverText').classList.add('hidden');

        this.running = true;

        this.player1.updateOjamaIndicator();
        this.player2.updateOjamaIndicator();

        // NEXT を先に描画してから READY を表示
        this.player1.drawNext();
        this.player2.drawNext();

        this.player1.showReady = true;
        this.player2.showReady = true;
        this.player1.draw();
        this.player2.draw();

        await new Promise(resolve => setTimeout(resolve, 1500));

        this.player1.showReady = false;
        this.player2.showReady = false;

        // ゲームスタート
        this.player1.spawnPuyo();
        this.player1.draw();
        this.player1.startFallTimer();

        this.player2.spawnPuyo();
        this.player2.draw();
        this._runCPU();
    }

    async _runCPU() {
        while (this.running && !this.player2.gameOver) {
            if (this.player2.currentPuyo) {
                await this.cpu.makeMove();
            }

            // processChains() がすでに spawnPuyo() を呼んでいる場合は重複させない
            if (!this.player2.gameOver && this.running && !this.player2.currentPuyo) {
                this.player2.spawnPuyo();
                this.player2.draw();
            }

            await new Promise(resolve => setTimeout(resolve, 500));

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
            // 引き分け → 再戦
            setTimeout(() => this.start(), 2000);
            return;
        }

        const cpuWon = this.player1.gameOver;
        if (cpuWon) this.wins2++;
        else         this.wins1++;
        this.updateWinStars();

        const winner = cpuWon ? this.player2 : this.player1;
        const loser  = cpuWon ? this.player1  : this.player2;
        const winsNeeded = cpuWon ? this.wins2 : this.wins1;

        if (winsNeeded >= 2) {
            // 最終勝利（2本先取）
            winner.showWin  = true;
            loser.showLose  = true;
            winner.draw();
            loser.draw();

            setTimeout(() => {
                this.wins1 = 0;
                this.wins2 = 0;
                this.updateWinStars();
                winner.showWin = false;
                loser.showLose = false;
                document.querySelectorAll('input[name="difficulty"]').forEach(r => r.disabled = false);
                document.getElementById('startBtn').style.display = 'block';
            }, 3000);
        } else {
            // 1本取り（中間）
            winner.showTazen = true;
            loser.showGununu = true;
            winner.draw();
            loser.draw();

            setTimeout(() => {
                winner.showTazen = false;
                loser.showGununu = false;
                this.start();
            }, 2000);
        }
    }

    updateWinStars() {
        const STARS = [['☆☆', '★☆', '★★'], ['☆☆', '☆★', '★★']];
        document.getElementById('player1Stars').textContent = STARS[0][Math.min(this.wins1, 2)];
        document.getElementById('player2Stars').textContent = STARS[1][Math.min(this.wins2, 2)];
    }
}

// エントリーポイント
const game = new GameManager();
