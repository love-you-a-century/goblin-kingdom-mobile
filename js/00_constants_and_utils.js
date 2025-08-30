// --- 技能樹資料 ---
const SKILL_TREES = {
    combat: [
        {
            id: 'combat_powerful_strike',
            name: '強力一擊',
            description: '玩家計算完普通攻擊傷害後，額外增加哥布林王總力量的百分比傷害。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseCooldown: 12,
            minCooldown: 5,
            levels: [
                { cost: 2, effect: { multiplier: 1.4 } },
                { cost: 4, effect: { multiplier: 1.8 } },
                { cost: 6, effect: { multiplier: 2.2 } },
                { cost: 8, effect: { multiplier: 2.6 } },
                { cost: 10, effect: { multiplier: 3.0 } }
            ]
        },
        {
            id: 'combat_quick_cooldown',
            name: '快速冷卻',
            description: '被動：永久減少所有主動技能的冷卻時間。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 5, effect: { value: 1 } },
                { cost: 10, effect: { value: 2 } },
                { cost: 15, effect: { value: 3 } },
                { cost: 20, effect: { value: 4 } },
                { cost: 25, effect: { value: 5 } }
            ]
        },
        {
            id: 'tribe_01',
            name: '集團戰略',
            description: '你將夥伴的力量化為己用。被動地將所有夥伴總能力的百分比，轉化為哥布林王自身的額外能力。', // <-- 更新描述
            maxLevel: 5,
            dependencies: [],
            type: 'passive', // <-- 從 'hybrid' 改為 'passive'
            combatActive: false, // <-- 從 true 改為 false
            // 移除了 baseDuration, baseCooldown, minCooldown
            levels: [
                { cost: 5,  passive: 0.1 },
                { cost: 10, passive: 0.2 },
                { cost: 15, passive: 0.3 },
                { cost: 20, passive: 0.4 },
                { cost: 25, passive: 0.5 }
            ]
        },
    ],
    raiding: [],
    tribe: [],
    breeding: []
};

// --- 地圖尺寸設定 ---
const MAP_WIDTH = 480;
const MAP_HEIGHT = 700;
const GRID_SIZE = 120;

// --- 騎士團單位資料 ---
const KNIGHT_ORDER_UNITS = {
    '士兵': { ratio: [2, 3, 2, 3], skill: { name: '衝鋒', cd: 9, type: 'aoe_str', multiplier: 0.5, description: '以自身力量0.5倍，對全體哥布林造成範圍傷害。' } },
    '盾兵': { ratio: [7, 1, 1, 1], skill: { name: '盾牆', cd: 6, type: 'taunt', duration: 3, description: '嘲諷全體哥布林，吸引所有傷害。' } },
    '槍兵': { ratio: [3, 3, 3, 1], skill: { name: '槍陣', cd: 5, type: 'reflect_buff', duration: 99, damagePercent: 2, description: '任何攻擊騎士團的哥布林，都會受到自身最大生命值2%的反噬傷害。' } },
    '弓兵': { ratio: [1, 4, 1, 4], skill: { name: '箭雨', cd: 3, type: 'aoe_agi', multiplier: 1, description: '以自身敏捷1倍，對全體哥布林造成範圍傷害。' } },
    '騎士': { ratio: [3, 3, 1, 3], skill: { name: '騎士道', cd: 7, type: 'king_nuke', description: '無視哥布林夥伴加成，對哥布林王本體造成巨大傷害。' } },
    '法師': { ratio: [1, 1, 7, 1], skill: { name: '破滅法陣', cd: 8, type: 'charge_nuke', multiplier: 2, chargeTime: 8, description: '詠唱8回合，結束後造成毀滅性範圍傷害。' } },
    '祭司': { ratio: [1, 1, 4, 4], skill: { name: '聖光', cd: 10, type: 'team_heal', triggerHp: 0.8, description: '當騎士團隊伍總血量低於80%時施放，恢復所有團員生命。' } },
};

/**
 * 根據傳入的骰子字串 (例如 "3d6") 進行擲骰。
 * @param {string} diceString - 格式為 "數量d面數" 的字串。
 * @returns {{total: number, rolls: number[], count: number, sides: number}} - 包含總和、每次擲骰結果陣列、骰子數量和面數的物件。
 */
function rollDice(diceString) {
  const [countStr, sidesStr] = diceString.toLowerCase().split('d');
  const count = parseInt(countStr);
  const sides = parseInt(sidesStr);

  if (isNaN(count) || isNaN(sides) || count < 0 || sides <= 0) {
    console.error("無效的擲骰字串:", diceString);
    return { total: 0, rolls: [], count: 0, sides: 0 };
  }

  let total = 0;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }
  return { total, rolls, count, sides };
}

// --- 工具 & 常數 ---
const $ = (selector) => document.querySelector(selector);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const REVENGE_DIFFICULTY_COEFFICIENT = { easy: 0.5, normal: 1, hard: 1.5, hell: 2 };
const rollPercentage = (percentage) => randomInt(1, 100) <= Math.max(5, Math.min(95, percentage));
const STAT_NAMES = { strength: '力量', agility: '敏捷', intelligence: '智力', luck: '運氣', hp: '生命', damage: '傷害', blockChance: '格擋率' };
const EQUIPMENT_SLOTS = { mainHand: '主手', offHand: '副手', chest: '身體' };
const TWO_HANDED_WEAPONS = ['雙手劍', '弓'];
const STAT_DESCRIPTIONS = {
    strength: '力量：影響物理傷害和資源採集效率。',
    agility: '敏捷：影響命中率、迴避率和潛行成功率。',
    intelligence: '智力：影響魔法傷害、偵查能力和夥伴訓練成果。',
    luck: '運氣：影響幸運觸發率和每日可繁衍次數。'
};
const CITY_NAMES = {
    easy: { prefixes: ['溪木', '野豬', '微風', '月光'], suffix: '村' },
    normal: { prefixes: ['邊境', '白楊', '河灣', '峭壁'], suffix: '鎮' },
    hard: { prefixes: ['鐵壁', '白石', '榮光', '烈陽'], suffix: '都' },
    hell: { prefixes: ['風暴', '永恆', '聖光', '龍臨'], suffix: '王城' },
};
const BUILDING_TYPES = ['民房', '麵包坊', '農場', '教堂', '鐵匠鋪', '裁縫店', '衛兵所', '妓院', '豪宅', '伐木場', '礦坑'];
const FEMALE_NAMES = ['愛麗絲', '伊麗莎白', '凱瑟琳', '安妮', '瑪格麗特', '艾格尼絲', '瑪麗亞', '貝拉', '克洛伊', '黛西', '艾瑪', '菲歐娜', '吉賽兒', '海倫', '艾琳', '漢娜', '索菲亞', '伊莎貝拉', '阿米莉亞', '艾米莉'];
const MALE_NAMES = ['亞瑟', '班', '查理', '丹尼爾', '伊森', '芬恩', '蓋文', '亨利', '丹尼', '傑克', '杰瑞', '傑森'];
const PROFESSIONS = ['居民', '女僕', '修女', '農婦', '商人', '妓女', '麵包師', '廚師', '裁縫師' ,'吟遊詩人', '藝術家' ];
const ENEMY_STAT_RANGES = {
    easy:    { resident: [20, 20], guard: [20, 40] },
    normal: { resident: [20, 40], guard: [40, 80] },
    hard:    { resident: [40, 80], guard: [80, 160] },
    hell:    { resident: [80, 160], guard: [160, 320] },
};
const VISUAL_OPTIONS = {
    hairColor: ['金色', '黑色', '棕色', '紅色', '銀色', '灰色', '白色', '藍色', '綠色', '焦糖色', '紅棕色', '藍黑色', '薰衣草灰', '薄荷綠', '蜂蜜色', '冷棕色', '霧感灰', '藍灰色'],
    hairStyle: ['長髮', '男孩風短髮', '馬尾', '大波浪捲髮', '雙馬尾', '狼尾剪短髮', '精靈短髮', '鮑伯頭', '齊瀏海短髮', '長瀏海短髮', '中長捲髮', '及肩髮', '公主切', '水波捲', '羊毛捲', '木馬捲', '蘋果頭', '水母頭'],
    bust: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    personality: ['溫順', '倔強', '開朗', '害羞', '傲慢', '傲嬌', '男子氣', '大小姐', '古風', '坦率', '天真', '樂觀', '勇敢', '急躁', '熱情', '性感', '陰沉', '文靜', '冷靜', '自卑', '親切', '刻薄', '糊塗', '清挑', '病嬌', '中二病', '天然呆', '腹黑'],
    clothing: ['亞麻布衣', '精緻長裙', '皮甲', '絲綢禮服', '女僕裝', '收腰連衣裙', '寬袖長裙', '斗篷', '性感內衣']
};

// --- 裝備系統常數 ---
const EQUIPMENT_QUALITIES = {
    worn:      { name: '破舊', color: '#9ca3af', qualityBonus: -1, affixes: [0, 0] },
    common:    { name: '普通', color: '#ffffff', qualityBonus: 0,  affixes: [0, 1] },
    uncommon:  { name: '精良', color: '#4ade80', qualityBonus: 1,  affixes: [1, 1] },
    rare:      { name: '稀有', color: '#60a5fa', qualityBonus: 2,  affixes: [2, 2] },
    epic:      { name: '史詩', color: '#a78bfa', qualityBonus: 3,  affixes: [3, 3] },
    legendary: { name: '傳說', color: '#f97316', qualityBonus: 5,  affixes: [3, 4] },
};

const EQUIPMENT_MATERIALS = {
    // --- 金屬 (Metal) ---
    iron:       { name: '鐵',           tier: 1, type: 'metal', category: 'metal' },
    copper:     { name: '銅',           tier: 2, type: 'metal', category: 'metal' },
    steel:      { name: '鋼',           tier: 3, type: 'metal', category: 'metal' },
    silver:     { name: '銀',           tier: 4, type: 'metal', category: 'metal' },
    gold:       { name: '黃金',         tier: 5, type: 'metal', category: 'metal' },
    mithril:    { name: '秘銀',         tier: 6, type: 'metal', category: 'metal' },
    orichalcum: { name: '殞鐵',         tier: 7, type: 'metal', category: 'metal' },

    // --- 木材 (Wood) ---
    pine:       { name: '松木',         tier: 1, type: 'wood', category: 'wood' },
    ash:        { name: '白蠟木',       tier: 2, type: 'wood', category: 'wood' },
    mahogany:   { name: '桃花心木',     tier: 3, type: 'wood', category: 'wood' },
    rosewood:   { name: '紫檀木',       tier: 4, type: 'wood', category: 'wood' },
    ebony:      { name: '烏木',         tier: 5, type: 'wood', category: 'wood' },
    ironwood:   { name: '鐵木',         tier: 6, type: 'wood', category: 'wood' },
    godwood:    { name: '神木',         tier: 7, type: 'wood', category: 'wood' },

    // --- 【新增】皮革 (Leather) ---
    crude_hide:         { name: '粗製獸皮',     tier: 1, type: 'leather', category: 'leather' },
    tanned_leather:     { name: '鞣製皮革',     tier: 2, type: 'leather', category: 'leather' },
    hardened_leather:   { name: '硬化皮革',     tier: 3, type: 'leather', category: 'leather' },
    studded_leather:    { name: '鑲釘皮革',     tier: 4, type: 'leather', category: 'leather' },
    monster_leather:    { name: '魔獸皮革',     tier: 5, type: 'leather', category: 'leather' },
    drakeskin_leather:  { name: '龍蜥皮革',     tier: 6, type: 'leather', category: 'leather' },
    dragonscale_leather:{ name: '巨龍皮革',     tier: 7, type: 'leather', category: 'leather' },

    // --- 【新增】布料 (Cloth) ---
    linen:              { name: '亞麻',         tier: 1, type: 'cloth', category: 'cloth' },
    wool:               { name: '羊毛',         tier: 2, type: 'cloth', category: 'cloth' },
    reinforced_fiber:   { name: '強化纖維',     tier: 3, type: 'cloth', category: 'cloth' },
    spider_silk:        { name: '蛛絲',         tier: 4, type: 'cloth', category: 'cloth' },
    enchanted_silk:     { name: '附魔絲綢',     tier: 5, type: 'cloth', category: 'cloth' },
    star_brocade:       { name: '星辰織錦',     tier: 6, type: 'cloth', category: 'cloth' },
    soulweave:          { name: '靈魂織物',     tier: 7, type: 'cloth', category: 'cloth' },
};

const CRAFTING_COSTS = {
    1: { food: 5,   wood: 5,   stone: 5 },
    2: { food: 10,  wood: 10,  stone: 10 },
    3: { food: 20,  wood: 20,  stone: 20 },
    4: { food: 40,  wood: 40,  stone: 40 },
    5: { food: 80,  wood: 80,  stone: 80 },
    6: { food: 160, wood: 160, stone: 160 },
    7: { food: 320, wood: 320, stone: 320 },
};

const WEAPON_STATS = {
    '劍':     { 1: 10, 2: 15, 3: 23, 4: 35, 5: 53, 6: 80, 7: 120 },
    '雙手劍': { 1: 16, 2: 24, 3: 36, 4: 54, 5: 81, 6: 122, 7: 183 },
    '長槍':   { 1: 12, 2: 18, 3: 27, 4: 41, 5: 62, 6: 93, 7: 140 },
    '弓':     { 1: 12, 2: 18, 3: 27, 4: 41, 5: 62, 6: 93, 7: 140 },
    '法杖':   { 1: 12, 2: 18, 3: 27, 4: 41, 5: 62, 6: 93, 7: 140 },
};

// 鎧甲
const PLATE_ARMOR_STATS = {
    1: { attackBonus: 2,  damageReduction: 6 },
    2: { attackBonus: 3,  damageReduction: 12 },
    3: { attackBonus: 5,  damageReduction: 18 },
    4: { attackBonus: 8,  damageReduction: 24 },
    5: { attackBonus: 13, damageReduction: 30 },
    6: { attackBonus: 21, damageReduction: 36 },
    7: { attackBonus: 34, damageReduction: 42 },
};

// 皮甲
const LEATHER_ARMOR_STATS = {
    1: { damageReduction: 4,  allStats: 5 },
    2: { damageReduction: 8,  allStats: 10 },
    3: { damageReduction: 12, allStats: 15 },
    4: { damageReduction: 16, allStats: 20 },
    5: { damageReduction: 20, allStats: 25 },
    6: { damageReduction: 24, allStats: 30 },
    7: { damageReduction: 28, allStats: 35 },
};

// 布服
const CLOTH_ARMOR_STATS = {
    1: { damageReduction: 2,  allStats: 10 },
    2: { damageReduction: 4,  allStats: 20 },
    3: { damageReduction: 6,  allStats: 30 },
    4: { damageReduction: 8,  allStats: 40 },
    5: { damageReduction: 10, allStats: 50 },
    6: { damageReduction: 12, allStats: 60 },
    7: { damageReduction: 14, allStats: 70 },
};

// 盾牌
const SHIELD_STATS = {
    1: { blockTarget: 19, attackBonus: 1 },
    2: { blockTarget: 18, attackBonus: 2 },
    3: { blockTarget: 17, attackBonus: 3 },
    4: { blockTarget: 16, attackBonus: 5 },
    5: { blockTarget: 15, attackBonus: 8 },
    6: { blockTarget: 14, attackBonus: 13 },
    7: { blockTarget: 13, attackBonus: 21 },
};

// --- 詞綴系統 ---
const STANDARD_AFFIXES = {
    strong: { name: '強壯的', type: 'stat', effects: [{ stat: 'strength', value: 1.1, type: 'multiplier' }], conflicts: ['savage', 'assassin'] },
    agile: { name: '靈巧的', type: 'stat', effects: [{ stat: 'agility', value: 1.1, type: 'multiplier' }], conflicts: ['troll'] },
    wise: { name: '智慧的', type: 'stat', effects: [{ stat: 'intelligence', value: 1.1, type: 'multiplier' }], conflicts: ['savage'] },
    lucky: { name: '幸運的', type: 'stat', effects: [{ stat: 'luck', value: 1.1, type: 'multiplier' }], conflicts: [] },
    sturdy: { name: '堅固的', type: 'stat', effects: [{ stat: 'hp', value: 1.1, type: 'multiplier' }], conflicts: ['troll'] },
    savage: { name: '野蠻的', type: 'stat', effects: [{ stat: 'strength', value: 1.25, type: 'multiplier' }, { stat: 'intelligence', value: 0.8, type: 'multiplier' }], conflicts: ['strong', 'wise', 'assassin'] },
    assassin: { name: '刺客的', type: 'stat', effects: [{ stat: 'agility', value: 1.25, type: 'multiplier' }, { stat: 'strength', value: 0.8, type: 'multiplier' }], conflicts: ['strong', 'savage'] },
    troll: { name: '巨魔的', type: 'stat', effects: [{ stat: 'hp', value: 1.25, type: 'multiplier' }, { stat: 'agility', value: 0.8, type: 'multiplier' }], conflicts: ['agile', 'sturdy'] },
    kings: { name: '哥布林王的', type: 'stat', effects: [{ stat: 'all', value: 1.05, type: 'multiplier' }], conflicts: [] },
    vampiric: { name: '吸血的', type: 'proc', procInfo: { baseRate: 10, type: 'vampiric', value: 0.5 } },
    spiky: { name: '尖刺的', type: 'proc', procInfo: { baseRate: 10, type: 'thorns', value: 0.1 } },
    multi_hit: { name: '連擊的', type: 'proc', procInfo: { baseRate: 5, type: 'multi_hit' } },
    devastating: { name: '毀滅的', type: 'proc', procInfo: { type: 'devastating', value: 1.5 } },
    regenerating: { name: '再生的', type: 'proc', procInfo: { type: 'regenerating', value: 0.05 } },
    blocking: { name: '格擋的', type: 'proc', procInfo: { baseRate: 5, type: 'blocking' } },
    penetrating: { name: '穿透的', type: 'proc', procInfo: { baseRate: 10, type: 'penetrating', value: 0.05 } },
};

// --- 輔助函式 ---
function distributeStatsWithRatio(totalPoints, ratio) {
    const stats = { strength: 0, agility: 0, intelligence: 0, luck: 0 };
    const statKeys = ['strength', 'agility', 'intelligence', 'luck'];
    const totalRatio = ratio.reduce((a, b) => a + b, 0);
    let pointsRemaining = totalPoints;

    if (totalRatio === 0) return distributeStats(totalPoints);

    for (let i = 0; i < ratio.length; i++) {
        const pointsForStat = Math.floor(totalPoints * (ratio[i] / totalRatio));
        stats[statKeys[i]] = pointsForStat;
        pointsRemaining -= pointsForStat;
    }

    while (pointsRemaining > 0) {
        stats[statKeys[randomInt(0, 3)]]++;
        pointsRemaining--;
    }
    return stats;
}

function distributeStatsWithFemaleKnightRatio(totalPoints, baseRatio) {
    const stats = { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 0 };
    const statKeys = ['strength', 'agility', 'intelligence', 'luck', 'charisma'];
    
    const finalRatio = [...baseRatio, 3];
    const totalRatio = finalRatio.reduce((a, b) => a + b, 0);
    let pointsRemaining = totalPoints;

    if (totalRatio === 0) {
        return distributeStats(totalPoints, statKeys);
    }

    for (let i = 0; i < finalRatio.length; i++) {
        const pointsForStat = Math.floor(totalPoints * (finalRatio[i] / totalRatio));
        stats[statKeys[i]] = pointsForStat;
        pointsRemaining -= pointsForStat;
    }

    while (pointsRemaining > 0) {
        stats[statKeys[randomInt(0, 4)]]++;
        pointsRemaining--;
    }
    return stats;
}

function distributeStats(totalPoints, statKeys = ['strength', 'agility', 'intelligence', 'luck']) {
    let stats = {};
    let pointsRemaining = totalPoints;
    statKeys.forEach(key => {
        stats[key] = 1;
        pointsRemaining--;
    });

    for (let i = 0; i < pointsRemaining; i++) {
        const randomStat = statKeys[randomInt(0, statKeys.length - 1)];
        stats[randomStat]++;
    }
    return stats;
}

function generateVisuals() {
    return {
        hairColor: VISUAL_OPTIONS.hairColor[randomInt(0, VISUAL_OPTIONS.hairColor.length - 1)],
        hairStyle: VISUAL_OPTIONS.hairStyle[randomInt(0, VISUAL_OPTIONS.hairStyle.length - 1)],
        height: randomInt(130, 170),
        age: randomInt(18, 30),
        bust: VISUAL_OPTIONS.bust[randomInt(0, VISUAL_OPTIONS.bust.length - 1)],
        personality: VISUAL_OPTIONS.personality[randomInt(0, VISUAL_OPTIONS.personality.length - 1)],
        clothing: VISUAL_OPTIONS.clothing[randomInt(0, VISUAL_OPTIONS.clothing.length - 1)],
    };
}
// --- 容量等級總表 ---
const CAPACITY_LEVELS = {
    warehouse: [10, 20, 40, 80, 160, 320, 640],
    storage: [200, 500, 1000, 2000, 4000, 8000, 16000],
    dungeon: [0, 5, 10, 15, 20, 25, 30],
    barracks: [5, 10, 20, 30, 40, 50]
};