// --- 技能樹資料 ---
const SKILL_TREES = {
    combat: [
        // --- 主動技能 ---
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
            id: 'combat_agile_strike',
            name: '迅捷一擊',
            description: '玩家計算完普通攻擊傷害後，額外增加哥布林王總敏捷的百分比傷害。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseCooldown: 12,
            minCooldown: 5,
            levels: [
                { cost: 2, effect: { multiplier: 1.4, stat: 'agility' } },
                { cost: 4, effect: { multiplier: 1.8, stat: 'agility' } },
                { cost: 6, effect: { multiplier: 2.2, stat: 'agility' } },
                { cost: 8, effect: { multiplier: 2.6, stat: 'agility' } },
                { cost: 10, effect: { multiplier: 3.0, stat: 'agility' } }
            ]
        },
        {
            id: 'combat_enchanted_strike',
            name: '附魔一擊',
            description: '玩家計算完普通攻擊傷害後，額外增加哥布林王總智力的百分比傷害。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseCooldown: 12,
            minCooldown: 5,
            levels: [
                { cost: 2, effect: { multiplier: 1.4, stat: 'intelligence' } },
                { cost: 4, effect: { multiplier: 1.8, stat: 'intelligence' } },
                { cost: 6, effect: { multiplier: 2.2, stat: 'intelligence' } },
                { cost: 8, effect: { multiplier: 2.6, stat: 'intelligence' } },
                { cost: 10, effect: { multiplier: 3.0, stat: 'intelligence' } }
            ]
        },
        {
            id: 'combat_lucky_strike',
            name: '幸運一擊',
            description: '玩家計算完普通攻擊傷害後，額外增加哥布林王總幸運的百分比傷害。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseCooldown: 12,
            minCooldown: 5,
            levels: [
                { cost: 2, effect: { multiplier: 1.4, stat: 'luck' } },
                { cost: 4, effect: { multiplier: 1.8, stat: 'luck' } },
                { cost: 6, effect: { multiplier: 2.2, stat: 'luck' } },
                { cost: 8, effect: { multiplier: 2.6, stat: 'luck' } },
                { cost: 10, effect: { multiplier: 3.0, stat: 'luck' } }
            ]
        },
        {
            id: 'combat_symbiosis',
            name: '共生關係',
            description: '施放後，所有受到的傷害將由哥布林王與全體夥伴平均分攤，並額外獲得傷害減免。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseDuration: 3,
            baseCooldown: 18,
            minCooldown: 1,
            levels: [
                { cost: 5, effect: { damageReduction: 0.05 } },
                { cost: 10, effect: { damageReduction: 0.10 } },
                { cost: 15, effect: { damageReduction: 0.15 } },
                { cost: 20, effect: { damageReduction: 0.20 } },
                { cost: 25, effect: { damageReduction: 0.25 } }
            ]
        },
        {
            id: 'combat_kings_pressure',
            name: '王之威壓',
            description: '降低全體敵人所有能力值。削弱的百分比為 我方哥布林夥伴總數 * 技能百分比。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: true,
            baseDuration: 3,
            baseCooldown: 18,
            minCooldown: 1,
            levels: [
                { cost: 5, effect: { debuff_per_partner: 0.005 } },
                { cost: 10, effect: { debuff_per_partner: 0.010 } },
                { cost: 15, effect: { debuff_per_partner: 0.015 } },
                { cost: 20, effect: { debuff_per_partner: 0.020 } },
                { cost: 25, effect: { debuff_per_partner: 0.025 } }
            ]
        },
        // --- 被動技能 ---
        {
            id: 'tribe_01',
            name: '集團戰略',
            description: '你將夥伴的力量化為己用。被動地將所有夥伴總能力的百分比，轉化為哥布林王自身的額外能力。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            combatActive: false,
            levels: [
                { cost: 5,  passive: 0.1 },
                { cost: 10, passive: 0.2 },
                { cost: 15, passive: 0.3 },
                { cost: 20, passive: 0.4 },
                { cost: 25, passive: 0.5 }
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
            id: 'combat_zero_authority',
            name: '歸零的權能',
            description: '施放任何主動技能後，有 10% 機率立即清除該技能的冷卻時間。',
            maxLevel: 1,
            dependencies: ['post_final_boss'], // 特殊依賴
            type: 'passive',
            levels: [{ cost: 50, effect: { chance: 0.1 } }]
        },
    ],
    tribe: [
        {
            id: 'tribe_forced_labor',
            name: '強制勞動',
            description: '立即完成所有派遣任務，並獲得該次派遣的全部資源，不消耗遊戲天數。',
            maxLevel: 5,
            dependencies: [],
            type: 'active',
            combatActive: false, // 這是在部落畫面使用的主動技能
            baseCooldown: 9,
            minCooldown: 5,
            levels: [
                { cost: 2, effect: { cooldown_override: 9 } },
                { cost: 4, effect: { cooldown_override: 8 } },
                { cost: 6, effect: { cooldown_override: 7 } },
                { cost: 8, effect: { cooldown_override: 6 } },
                { cost: 10, effect: { cooldown_override: 5 } }
            ]
        },
        {
            id: 'tribe_efficient_gathering',
            name: '高效採集',
            description: '增加派遣任務獲得的各類資源量。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 2, effect: { multiplier: 1.05 } },
                { cost: 4, effect: { multiplier: 1.10 } },
                { cost: 6, effect: { multiplier: 1.15 } },
                { cost: 8, effect: { multiplier: 1.20 } },
                { cost: 10, effect: { multiplier: 1.25 } }
            ]
        },
        {
            id: 'tribe_architecture',
            name: '建築學',
            description: '降低所有建築升級所需的資源成本。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 2, effect: { cost_reduction: 0.05 } },
                { cost: 4, effect: { cost_reduction: 0.10 } },
                { cost: 6, effect: { cost_reduction: 0.15 } },
                { cost: 8, effect: { cost_reduction: 0.20 } },
                { cost: 10, effect: { cost_reduction: 0.25 } }
            ]
        },
        {
            id: 'tribe_negotiation',
            name: '談判技巧',
            description: '與旅行商人「世紀」交易時，降低所有商品所需的「俘虜價值」。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 2, effect: { price_reduction: 0.05 } },
                { cost: 4, effect: { price_reduction: 0.10 } },
                { cost: 6, effect: { price_reduction: 0.15 } },
                { cost: 8, effect: { price_reduction: 0.20 } },
                { cost: 10, effect: { price_reduction: 0.25 } }
            ]
        },
        {
            id: 'tribe_spiral_authority',
            name: '螺旋的權能',
            description: '當哥布林夥伴在戰鬥中陣亡時，有 25% 機率不會消失，而是以全滿生命值的狀態返回部落寢室。',
            maxLevel: 1,
            dependencies: ['post_final_boss'],
            type: 'passive',
            levels: [{ cost: 50, effect: { chance: 0.25 } }]
        }
    ],
    raiding: [
        {
            id: 'raid_scout_spread',
            name: '散開偵查',
            description: '在掠奪地圖上使用。所有出擊隊伍中的夥伴將各自選擇一個未偵查的目標進行偵查。此期間，哥布林王的夥伴加成會暫時失效。當玩家進行下一個行動後，夥伴會回歸，並結算所有偵查結果。',
            maxLevel: 1,
            dependencies: [],
            type: 'active',
            combatActive: false, // 這是在掠奪地圖使用的主動技能
            cooldown: 1, // 每個區域一次
            levels: [{ cost: 10 }]
        },
        {
            id: 'raid_deep_scavenging',
            name: '深度搜刮',
            description: '搜刮建築時，增加獲得的各類資源量。',
            maxLevel: 5,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 2, effect: { multiplier: 1.05 } },
                { cost: 4, effect: { multiplier: 1.10 } },
                { cost: 6, effect: { multiplier: 1.15 } },
                { cost: 8, effect: { multiplier: 1.20 } },
                { cost: 10, effect: { multiplier: 1.25 } }
            ]
        },
        {
            id: 'raid_dispersed_escape',
            name: '散開脫逃',
            description: '降低因我方人數多於敵方而導致的潛行/脫逃成功率懲罰。',
            maxLevel: 3,
            dependencies: [],
            type: 'passive',
            levels: [
                { cost: 4, effect: { penalty_reduction: 0.25 } },
                { cost: 8, effect: { penalty_reduction: 0.50 } },
                { cost: 12, effect: { penalty_reduction: 0.75 } }
            ]
        },
        {
            id: 'raid_reappearing_authority',
            name: '重現的權能',
            description: '每次成功搜刮一棟建築後，有 10% 機率可以對該建築再次進行搜刮。',
            maxLevel: 1,
            dependencies: ['post_final_boss'],
            type: 'passive',
            levels: [{ cost: 50, effect: { chance: 0.1 } }]
        }
    ],
    breeding: [
        {
            id: 'breed_vigorous',
            name: '精力旺盛',
            description: '立即恢復當日已消耗的繁衍次數。',
            maxLevel: 5,
            dependencies: ['post_apostle_boss'], // 使徒
            type: 'active',
            combatActive: false,
            baseCooldown: 3, // 單位: 天
            minCooldown: 3,
            levels: [
                { cost: 5, effect: { charges: 1 } },
                { cost: 10, effect: { charges: 2 } },
                { cost: 15, effect: { charges: 3 } },
                { cost: 20, effect: { charges: 4 } },
                { cost: 25, effect: { charges: 5 } }
            ]
        },
        {
            id: 'breed_eugenics',
            name: '優生學',
            description: '新誕生的哥布林夥伴，有一定機率獲得額外的初始能力點。額外點數為 Floor(哥布林王原始能力值 / 10)。',
            maxLevel: 5,
            dependencies: ['post_apostle_boss'],
            type: 'passive',
            levels: [
                { cost: 2, effect: { chance: 0.05 } },
                { cost: 4, effect: { chance: 0.10 } },
                { cost: 6, effect: { chance: 0.15 } },
                { cost: 8, effect: { chance: 0.20 } },
                { cost: 10, effect: { chance: 0.25 } }
            ]
        },
        {
            id: 'breed_polyspermy',
            name: '多精卵',
            description: '懷孕的俘虜在生產時，有一定機率生下雙胞胎或三胞胎。',
            maxLevel: 2,
            dependencies: ['post_apostle_boss'],
            type: 'passive',
            levels: [
                { cost: 15, effect: { twins_chance: 0.05 } },
                { cost: 30, effect: { twins_chance: 0.10, triplets_chance: 0.01 } }
            ]
        },
        {
            id: 'breed_breeding_authority',
            name: '繁衍的權能',
            description: '懷孕的俘虜在每日結算時，有 5% 機率立即完成懷孕週期，直接生產哥布林夥伴。',
            maxLevel: 1,
            dependencies: ['post_final_boss'],
            type: 'passive',
            levels: [{ cost: 50, effect: { chance: 0.05 } }]
        }
    ]
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

// 【新增】高等精靈守衛單位資料 (數值為臨時範例)
const HIGH_ELF_GUARDS = {
    '精靈劍士': { ratio: [2, 4, 3, 1], skill: { name: '月光斬', cd: 8, type: 'aoe_agi', multiplier: 0.6, description: '以自身敏捷0.6倍，對全體哥布林造成範圍傷害。' } },
    '精靈護衛': { ratio: [3, 3, 3, 1], skill: { name: '樹皮護盾', cd: 7, type: 'taunt', duration: 3, description: '嘲諷全體哥布林，吸引所有傷害。' } },
    '精靈遊俠': { ratio: [1, 7, 1, 1], skill: { name: '精準射擊', cd: 3, type: 'king_nuke', description: '無視哥布林夥伴加成，對哥布林王本體造成巨大傷害。' } },
    '精靈法師': { ratio: [1, 1, 7, 1], skill: { name: '藤蔓纏繞', cd: 8, type: 'charge_nuke', multiplier: 1.8, chargeTime: 7, description: '詠唱7回合，結束後造成毀滅性範圍傷害。' } },
    '精靈祭司': { ratio: [1, 1, 4, 4], skill: { name: '生命之泉', cd: 10, type: 'team_heal', triggerHp: 0.8, description: '當隊伍總血量低於80%時施放，恢復所有團員生命。' } },
};

// 【新增】亞獸人冠軍鬥士單位資料 (數值為臨時範例)
const BEASTKIN_CHAMPIONS = {
    '亞獸人戰士': { ratio: [4, 3, 2, 1], skill: { name: '野性衝鋒', cd: 9, type: 'aoe_str', multiplier: 0.7, description: '以自身力量0.7倍，對全體哥布林造成範圍傷害。' } },
    '亞獸人蠻兵': { ratio: [7, 1, 1, 1], skill: { name: '獸血沸騰', cd: 6, type: 'reflect_buff', duration: 99, damagePercent: 2.5, description: '任何攻擊的哥布林，都會受到自身最大生命值2.5%的反噬傷害。' } },
    '亞獸人獵手': { ratio: [3, 4, 1, 2], skill: { name: '致命投擲', cd: 4, type: 'king_nuke', description: '無視哥布林夥伴加成，對哥布林王本體造成巨大傷害。' } },
    '亞獸人薩滿': { ratio: [1, 1, 4, 4], skill: { name: '先祖之魂', cd: 10, type: 'team_heal', triggerHp: 0.75, description: '當隊伍總血量低於75%時施放，恢復所有團員生命。' } },
};

// --- 特殊 BOSS 資料 ---
const SPECIAL_BOSSES = {
    apostle_maiden: {
        name: '螺旋女神的使徒',
        profession: '使徒',
        avatar: 'assets/apostle_avatar.png', //在這裡加上頭像路徑
        stats: { strength: 180, agility: 180, intelligence: 180, luck: 180, charisma: 120 }, // 
        visual: {
            hairColor: '藍綠色', // [cite: 39]
            hairStyle: '拖地長髮', // [cite: 39]
            height: 160, // [cite: 39]
            age: '未知', // [cite: 39]
            bust: 'C', // [cite: 39]
            personality: '高飛車', // [cite: 39]
            clothing: '纏繞身體的頭髮' // [cite: 39]
        },
        skills: [
            {
                id: 'apostle_proliferate',
                name: '繁衍的權能', // [cite: 21]
                type: 'active',
                baseCooldown: 8, // [cite: 21]
                description: '開場時立即施放一次。完整複製一個自己到戰場上，包含當前的所有正面與負面效果。' // [cite: 21]
            },
            { id: 'apostle_reappear', name: '重現的權能', type: 'passive', description: '每當施放「繁衍的權能」後，能立即再進行一次行動。' }, // [cite: 21]
            { id: 'apostle_spiral', name: '螺旋的權能', type: 'passive', description: '在戰鬥中陣亡時，有 25% 機率以 50% 生命值復活，並立即重置「繁衍的權能」冷卻時間。' }, // [cite: 21]
            { id: 'apostle_nullify', name: '歸零的權能', type: 'passive', description: '受到任何傷害時，有 25% 機率使該次傷害變為 0，並恢復等同於該次傷害 50% 的生命值。' }, // [cite: 21]
            { id: 'apostle_multiply', name: '螺旋女神的使徒？', type: 'passive', description: '自身所有能力值（力/敏/智/運/魅）都會乘以場上「螺旋女神的使徒」的總數量 (N)，N 值上限為 20。' } // [cite: 21]
        ],
        dialogues: {
            intro: [
                "來自異界的靈魂，吾乃『螺旋女神』的使徒，前來肅清擾亂世界秩序的『變數』...也就是你！", // [cite: 18]
                "見識一下吧，這就是女神真正的權能。在你那可悲的復活能力面前，我將賜予你無限的絕望。" // [cite: 19]
            ],
            hp_75: "哦？有點能耐。但不過是垂死掙扎罷了。", // [cite: 24]
            hp_50: "還能站著嗎？開始變得有趣了...", // [cite: 26]
            hp_25: "不可原諒...區區哥布林...！", // [cite: 28]
            player_hp_50: "看到了嗎？這就是你與我之間，絕對無法跨越的差距。" // [cite: 30]
        }
    },
    spiral_goddess_mother: {
        name: '螺旋女神',
        profession: '女神',
        avatar: 'assets/goddess_avatar.png',// 在這裡加上頭像路徑
        stats: { strength: 2600, agility: 2600, intelligence: 2600, luck: 2600, charisma: 2902 },
        captiveFormStats: { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 290 },
        visual: {
            hairColor: '淺藍色',
            hairStyle: '螺旋長髮',
            height: 175,
            age: '未知',
            bust: 'I',
            personality: '堅強',
            clothing: '淺藍色的類希臘女神裝束'
        },
        skills: [
            {
                id: 'goddess_repulsion',
                name: '同性相斥',
                type: 'active',
                baseCooldown: 4,
                description: '對我方全體造成基於各自魅力值的真實傷害。'
            }
        ],
        dialogues: {
            intro: "一個迷途的靈魂，披著哥布林的外皮...？...不對，你的身上...還有另一個討厭的氣息超脫了時間與空間...。",
            phase1_start: "在我面前，謊言毫無意義。",
            phase2_start: "在我面前，你與人類無異。",
            phase3_start: "你似乎很享受掠奪女性的快感...那麼也來體會一下作為『女性』的滋味。",
            phase4_start: "讓你見識一下，男女間的力量差距。",
            phase5_start: "就讓你親身體會一下，那些被你擄來的女性，在面對絕對暴力時的絕望。"
            
        },
        qna: [
            { question: "作為一個哥布林，你的身高是？", check: 'playerHeight' },
            { question: "你麾下有多少名哥布林夥伴？", check: 'partnerCount' },
            { question: "身為王者，你的雄風尺寸是？", check: 'penisSize' },
            { question: "你的地牢與產房中，總共囚禁了多少名俘虜？", check: 'captiveCount' }
        ]
    },
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
    // 人類
    easy:   { resident: [20, 20],  guard: [20, 40] },
    normal: { resident: [20, 40],  guard: [40, 80] },
    hard:   { resident: [40, 80],  guard: [80, 140] },
    hell:   { resident: [80, 140], guard: [140, 220] },
    // 精靈/亞獸人 (根據你提供的文件) 
    dlc_easy:   { resident: [140, 160], guard: [200, 220], champion: [280, 300] },
    dlc_normal: { resident: [160, 200], guard: [220, 260], champion: [300, 340] },
    dlc_hard:   { resident: [200, 260], guard: [260, 320], champion: [340, 400] },
    dlc_hell:   { resident: [260, 340], guard: [320, 400], champion: [400, 480] }
};
const VISUAL_OPTIONS = {
    hairColor: ['金色', '黑色', '棕色', '紅色', '銀色', '灰色', '白色', '藍色', '綠色', '焦糖色', '紅棕色', '藍黑色', '薰衣草灰', '薄荷綠', '蜂蜜色', '冷棕色', '霧感灰', '藍灰色'],
    hairStyle: ['長髮', '男孩風短髮', '馬尾', '大波浪捲髮', '雙馬尾', '狼尾剪短髮', '精靈短髮', '鮑伯頭', '齊瀏海短髮', '長瀏海短髮', '中長捲髮', '及肩髮', '公主切', '水波捲', '羊毛捲', '木馬捲', '蘋果頭', '水母頭'],
    bust: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    personality: ['溫順', '倔強', '開朗', '害羞', '傲慢', '傲嬌', '男子氣', '大小姐', '古風', '坦率', '天真', '樂觀', '勇敢', '急躁', '熱情', '性感', '陰沉', '文靜', '冷靜', '自卑', '親切', '刻薄', '糊塗', '清挑', '病嬌', '中二病', '天然呆', '腹黑'],
    clothing: ['亞麻布衣', '精緻長裙', '皮甲', '絲綢禮服', '女僕裝', '收腰連衣裙', '寬袖長裙', '斗篷'],
    elfEars: ['(平行)短尖耳', '(上翹)短尖耳', '(下垂)短尖耳', '(平行)長尖耳', '(上翹)長尖耳', '(下垂)長尖耳'],
    beastkinSubspecies: ['犬', '貓', '鳥', '馬', '熊', '牛', '鼠', '浣熊', '鹿', '獅', '虎', '豹'],
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

    // --- 皮革 (Leather) ---
    crude_hide:         { name: '粗製獸皮',     tier: 1, type: 'leather', category: 'leather' },
    tanned_leather:     { name: '鞣製皮革',     tier: 2, type: 'leather', category: 'leather' },
    hardened_leather:   { name: '硬化皮革',     tier: 3, type: 'leather', category: 'leather' },
    studded_leather:    { name: '鑲釘皮革',     tier: 4, type: 'leather', category: 'leather' },
    monster_leather:    { name: '魔獸皮革',     tier: 5, type: 'leather', category: 'leather' },
    drakeskin_leather:  { name: '龍蜥皮革',     tier: 6, type: 'leather', category: 'leather' },
    dragonscale_leather:{ name: '巨龍皮革',     tier: 7, type: 'leather', category: 'leather' },

    // --- 布料 (Cloth) ---
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
    // DLC 武器 (我已根據您提供的基礎傷害，參考現有武器的成長曲線，推算出各階級的傷害)
    '短刀':   { 1: 8,  2: 12, 3: 18, 4: 27, 5: 41, 6: 62, 7: 93 },
    '爪':     { 1: 7,  2: 11, 3: 17, 4: 26, 5: 39, 6: 59, 7: 88 },
    '拐棍':   { 1: 7,  2: 11, 3: 17, 4: 26, 5: 39, 6: 59, 7: 88 },
    '斧頭':   { 1: 11, 2: 17, 3: 26, 4: 39, 5: 58, 6: 87, 7: 130 },
    '彎刀':   { 1: 10, 2: 15, 3: 23, 4: 35, 5: 53, 6: 80, 7: 120 },
    '長鞭':   { 1: 9,  2: 14, 3: 21, 4: 32, 5: 48, 6: 72, 7: 108 },
    '拳套':   { 1: 6,  2: 9,  3: 14, 4: 21, 5: 32, 6: 48, 7: 72 },
};

// 鎧甲
const PLATE_ARMOR_STATS = {
    1: { attackBonus: 2,  damageReduction: 6,  allStats: 2 },
    2: { attackBonus: 3,  damageReduction: 12, allStats: 4 },
    3: { attackBonus: 5,  damageReduction: 18, allStats: 6 },
    4: { attackBonus: 8,  damageReduction: 24, allStats: 8 },
    5: { attackBonus: 13, damageReduction: 30, allStats: 10 },
    6: { attackBonus: 21, damageReduction: 36, allStats: 12 },
    7: { attackBonus: 34, damageReduction: 42, allStats: 14 },
};

// 皮甲
const LEATHER_ARMOR_STATS = {
    1: { damageReduction: 4,  allStats: 4 },
    2: { damageReduction: 8,  allStats: 8 },
    3: { damageReduction: 12, allStats: 12 },
    4: { damageReduction: 16, allStats: 16 },
    5: { damageReduction: 20, allStats: 20 },
    6: { damageReduction: 24, allStats: 24 },
    7: { damageReduction: 28, allStats: 28 },
};

// 布服
const CLOTH_ARMOR_STATS = {
    1: { damageReduction: 2,  allStats: 6 },
    2: { damageReduction: 4,  allStats: 12 },
    3: { damageReduction: 6,  allStats: 18 },
    4: { damageReduction: 8,  allStats: 24 },
    5: { damageReduction: 10, allStats: 30 },
    6: { damageReduction: 12, allStats: 36 },
    7: { damageReduction: 14, allStats: 42 },
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
    // --- T1 Stat Affixes ---
    strength: { name: '力量的', type: 'stat', effects: [{ stat: 'strength', value: 10 }] },
    agility: { name: '敏捷的', type: 'stat', effects: [{ stat: 'agility', value: 10 }] },
    intelligence: { name: '智力的', type: 'stat', effects: [{ stat: 'intelligence', value: 10 }] },
    luck: { name: '幸運的', type: 'stat', effects: [{ stat: 'luck', value: 10 }] },
    health: { name: '健康的', type: 'stat', effects: [{ stat: 'hp', value: 240 }] },

    // --- T2 Stat Affixes ---
    savage: { name: '蠻力的', type: 'stat', effects: [{ stat: 'strength', value: 20 }] },
    swift: { name: '迅捷的', type: 'stat', effects: [{ stat: 'agility', value: 20 }] },
    wise: { name: '睿智的', type: 'stat', effects: [{ stat: 'intelligence', value: 20 }] },
    fortunate: { name: '強運的', type: 'stat', effects: [{ stat: 'luck', value: 20 }] },
    sturdy: { name: '健壯的', type: 'stat', effects: [{ stat: 'hp', value: 480 }] },

    // --- T3 Stat Affixes ---
    goblin: { name: '哥布林的', type: 'stat', effects: [{ stat: 'all', value: 5 }] },
    goblin_king: { name: '哥布林王的', type: 'stat', effects: [{ stat: 'all', value: 10 }] },

    // --- Weapon Damage Affixes ---
    sword_mastery: { name: '單手劍的', type: 'weapon_damage', effects: [{ stat: 'strength', multiplier: 0.1 }] },
    greatsword_mastery: { name: '巨劍的', type: 'weapon_damage', effects: [{ stat: 'strength', multiplier: 0.3 }] },
    bow_mastery: { name: '弓箭的', type: 'weapon_damage', effects: [{ stat: 'agility', multiplier: 0.2 }] },
    staff_mastery: { name: '法杖的', type: 'weapon_damage', effects: [{ stat: 'intelligence', multiplier: 0.2 }] },
    spear_mastery: { name: '長槍的', type: 'weapon_damage', effects: [{ stat: 'luck', multiplier: 0.2 }] },

    // --- Proc & Special Affixes ---
    vampiric: { name: '吸血的', type: 'proc', procInfo: { baseRate: 10, type: 'vampiric', value: 0.5 } },
    spiky: { name: '尖刺的', type: 'proc', procInfo: { baseRate: 10, type: 'thorns', value: 0.1 } },
    multi_hit: { name: '連擊的', type: 'proc', procInfo: { baseRate: 5, type: 'multi_hit' } },
    devastating: { name: '毀滅的', type: 'crit_mod', effects: { crit_damage_bonus: 0.5 } },
    regenerating: { name: '再生的', type: 'proc', procInfo: { type: 'regenerating', value: 0.05 } },
    blocking: { name: '格擋的', type: 'proc', procInfo: { baseRate: 5, type: 'blocking' } },
    penetrating: { name: '穿透的', type: 'proc', procInfo: { baseRate: 10, type: 'penetrating', value: 0.1 } },
    critical_strike: { name: '爆擊的', type: 'crit_chance', effects: { value: 10 } },
    gambler: { name: '賭徒的', type: 'proc_rate_enhancer', effects: { value: 5 } },
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
// --- 建築容量等級總表 ---
const CAPACITY_LEVELS = {
    warehouse: [10, 20, 40, 80, 160, 320, 640],
    storage: [200, 500, 1000, 2000, 4000, 8000, 16000],
    dungeon: [0, 10, 20, 30, 40, 50],
    barracks: [5, 10, 20, 30, 40, 50]
};

const FESTIVALS = [
    // --- 情人節系列 ---
    {
        month: 1, date: 14, eventName: '日記情人節', type: 'valentine',
        avatar: 'assets/century-0114.png',
        dialogue: '「唉...一年之初就要寫日記？真是麻煩死了...不過...如果是記錄你的『有趣』事，我倒是考慮考慮...」'
    },
    {
        month: 2, date: 14, eventName: '西洋情人節', type: 'valentine',
        avatar: 'assets/century-0214.png',
        dialogue: '「哥布林王，聽說今天是個充滿『愛』的日子...有沒有準備什麼能讓我開心的『祭品』？嘿嘿嘿...」'
    },
    {
        month: 3, date: 14, eventName: '白色情人節', type: 'valentine',
        avatar: 'assets/century-0314.png',
        dialogue: '「嘖...回禮什麼的最麻煩了。不過看在你供品不錯的份上，這個就當作是我賞你的吧！」'
    },
    {
        month: 4, date: 14, eventName: '黑色情人節', type: 'valentine',
        avatar: 'assets/century-0414.png',
        dialogue: '「單身？寂寞？正好，把那些情緒都化為掠奪的動力吧！我這裡正好有好東西能幫你...呵...」'
    },
    {
        month: 5, date: 14, eventName: '玫瑰情人節', type: 'valentine',
        avatar: 'assets/century-0514.png',
        dialogue: '「送我玫瑰？俗氣。不如送我幾個『好貨』來得實際...你懂的吧？嘿嘿嘿...」'
    },
    {
        month: 6, date: 14, eventName: '親吻情人節', type: 'valentine',
        avatar: 'assets/century-0614.png',
        dialogue: '「想要一個吻嗎？哈哈哈~我開玩笑的~先拿出能讓我滿意的『代價』再說吧...哈」'
    },
    {
        month: 7, date: 14, eventName: '銀色情人節', type: 'valentine',
        avatar: 'assets/century-0714.png',
        dialogue: '「聽說今天是把『戀人』介紹給長輩的日子...要把我介紹給你的哥布林們嗎？沒事...我就開開玩笑，不要給我當真呀!!!」'
    },
    {
        month: 8, date: 14, eventName: '綠色情人節', type: 'valentine',
        avatar: 'assets/century-0814.png',
        dialogue: '「多親近大自然也不錯...你看，你的膚色和森林多搭啊。要不要考慮多抓幾個『精靈』？噢~我都忘了dlc還沒裝呢~」'
    },
    {
        month: 9, date: 14, eventName: '音樂/相片情人節', type: 'valentine',
        avatar: 'assets/century-0914.png',
        dialogue: '「笑一個~(喀擦)謝謝惠顧~奴隸1個~我就開開玩笑嘛~你問我這些東西從哪來的？難道你認為"世紀"只是單純的名子嗎?」'
    },
    {
        month: 10, date: 14, eventName: '葡萄酒情人節', type: 'valentine',
        avatar: 'assets/century-1014.png',
        dialogue: '「來一杯嗎？這可是用上好的『材料』釀造的...喝完之後...可是會很有『精神』的喔？不過你看來不太需要呢~哈哈哈~」'
    },
    {
        month: 11, date: 14, eventName: '電影情人節', type: 'valentine',
        avatar: 'assets/century-1114.png',
        dialogue: '「電影？這裡好像沒有這種東西，提線木偶倒是有。不過...你的王國崛起史，可更精彩。你問我怎麼知道電影?秘~密~」'
    },
    {
        month: 12, date: 14, eventName: '擁抱情人節', type: 'valentine',
        avatar: 'assets/century-1214.png',
        dialogue: '「你問我為什麼穿這樣？噢~對~這裡沒有聖誕節，那你的情人節禮物我就收走啦~開玩笑的啦，哈哈哈~」'
    }
];
// --- 顯示戰鬥浮動文字的函式 (定位在 '/' 上方) ---
function showFloatingText(targetUnitId, text, type = 'damage') {
    const targetContainer = document.getElementById('unit-display-' + targetUnitId);
    // 找到血量顯示中的 '/' 符號元素
    const slashSpan = document.getElementById('unit-slash-' + targetUnitId); 

    if (!targetContainer || !slashSpan) { 
        console.error("找不到浮動文字的目標容器或斜線符號:", targetUnitId);
        return;
    }

    const popup = document.createElement('div');
    popup.textContent = text;
    popup.className = 'damage-popup';

    if (type === 'damage') {
        popup.classList.add('damage');
        popup.textContent = `-${text}`;
    } else if (type === 'miss') {
        popup.classList.add('miss');
    }

    targetContainer.appendChild(popup);

    // 【定位在 '/' 符號上方】
    // 獲取 '/' span 和其父容器的相對位置
    const slashRect = slashSpan.getBoundingClientRect();
    const containerRect = targetContainer.getBoundingClientRect();

    // 計算新的 left 和 top 位置
    // left: 對齊 '/' 符號的中心
    // top: 對齊 '/' 符號的頂部，然後再往上移動一些，讓它浮在上方
    popup.style.left = `${slashRect.left - containerRect.left + (slashRect.width / 2)}px`; // 居中對齊 '/'
    popup.style.top = `${slashRect.top - containerRect.top - 10}px`; // 向上移動 10px，可以根據需要調整

    // 為了讓文字居中對齊到這個計算出的 left 位置，需要向左移動自身寬度的一半
    popup.style.transform = `translateX(-50%)`; 

    // 觸發 CSS 動畫 (這次也讓它稍微向上移動一點，更自然)
    requestAnimationFrame(() => {
        setTimeout(() => {
            popup.style.opacity = '0'; // 開始淡出
            popup.style.transform += ' translateY(-5px)'; // 在淡出的同時再向上飄移一點(-5px)
        }, 10);
    });

    // 在動畫結束後 (2秒)，從畫面中移除這個元素
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 2000);
}
