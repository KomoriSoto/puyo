// ゲーム定数
export const COLS = 6;
export const ROWS = 12;
export const CELL_SIZE = 40;
export const COLORS = ['red', 'blue', 'green', 'yellow'];
export const FALL_SPEED = 800;       // 通常落下速度 (ms)
export const FAST_FALL_SPEED = 50;  // 高速落下速度 (ms)
export const SPAWN_DELAY = 200;      // 次のぷよ出現までのディレイ (ms)
export const OJAMA_COLOR = 'gray';  // おじゃまぷよの色識別子

// ===== AI 重みパラメータ（つよいモード用） =====
export const INSANE_WEIGHTS = {
    chain3Bonus: 1500,          // 3連鎖以上を非常に高く評価
    chain3ClearBonus: 80,
    chain2Bonus: 150,           // 2連鎖は控えめ（早打ちを抑制）
    chain2ClearBonus: 10,
    chain1Base: 0,              // 1連鎖は無価値（無駄打ち防止）
    chain1ClearBonus: 0,
    largeChainBonus: 4000,      // 5連鎖以上に超大ボーナス
    triggerWeight: 1200,        // 連鎖ポテンシャルを2乗で評価
    nearGroupWeight: 15,
    heightPenalty: 7,
    holePenalty: 60,            // 穴は致命的
    variancePenalty: 12,
    dangerPenalty: 150,         // 危険ゾーンは絶対回避
    colorIsolationPenalty: 20,
    colorStackWeight: 30,       // 縦積みを強く奨励
};

// ===== ぷよ画像の読み込み =====
export const puyoImages = {};
const imageNames = ['red', 'blue', 'green', 'yellow', 'gray'];
imageNames.forEach(name => {
    const img = new Image();
    img.src = `assets/images/${name}.png`;
    puyoImages[name] = img;
});
