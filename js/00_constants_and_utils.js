 // --- 地圖尺寸設定 ---
        const MAP_WIDTH = 480;  // 【修改】地圖畫布寬度 (單位: px)
        const MAP_HEIGHT = 700; // 【修改】地圖畫布高度 (單位: px)
        const GRID_SIZE = 120;   // 【修改】稍微增大網格，讓佈局更鬆散
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

        // --- 工具 & 常數 ---
        const $ = (selector) => document.querySelector(selector);
        const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        // 【新增】定義復仇事件的難度係數
        const REVENGE_DIFFICULTY_COEFFICIENT = {
            easy: 0.5,
            normal: 1,
            hard: 1.5,
            hell: 2
        };
        const roll = (percentage) => randomInt(1, 100) <= Math.max(5, Math.min(95, percentage));
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
        const FEMALE_NAMES = ['愛麗絲', '伊麗莎白', '凱瑟琳', '安妮', '瑪格麗特', '艾格尼絲', '瑪麗亞', '貝拉', '克洛伊', '黛西', '艾瑪', '菲歐娜', '吉賽兒', '海倫', '艾琳', '奧黛麗'];
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
            worn:      { name: '破舊', color: '#9ca3af', multiplier: 0.4, affixes: [0, 1] },
            common:    { name: '普通', color: '#ffffff', multiplier: 0.8, affixes: [1, 1] },
            uncommon:  { name: '精良', color: '#4ade80', multiplier: 1.2, affixes: [1, 2] },
            rare:      { name: '稀有', color: '#60a5fa', multiplier: 1.6, affixes: [2, 2] },
            epic:      { name: '史詩', color: '#a78bfa', multiplier: 2.0, affixes: [2, 3] },
            legendary: { name: '傳說', color: '#f97316', multiplier: 2.4, affixes: [3, 3] },
        };

        const EQUIPMENT_MATERIALS = {
            iron:   { name: '鐵', tier: 1, type: 'metal', cost: 10 },
            copper: { name: '銅', tier: 2, type: 'metal', cost: 20 },
            steel:  { name: '鋼', tier: 3, type: 'metal', cost: 40 },
            silver: { name: '銀', tier: 4, type: 'metal', cost: 80 },
            gold:   { name: '黃金', tier: 5, type: 'metal', cost: 160 },
            mithril:{ name: '秘銀', tier: 6, type: 'metal', cost: 320 },
            orichalcum: { name: '殞鐵', tier: 7, type: 'metal', cost: 640 },
            pine:   { name: '松木', tier: 1, type: 'wood', cost: 10 },
            ash:    { name: '白蠟木', tier: 2, type: 'wood', cost: 20 },
            mahogany:{ name: '桃花心木', tier: 3, type: 'wood', cost: 40 },
            rosewood:{ name: '紫檀木', tier: 4, type: 'wood', cost: 80 },
            ebony:  { name: '烏木', tier: 5, type: 'wood', cost: 160 },
            ironwood:{ name: '鐵木', tier: 6, type: 'wood', cost: 320 },
            godwood: { name: '神木', tier: 7, type: 'wood', cost: 640 },
        };

        // --- 詞綴系統 ---
        const STANDARD_AFFIXES = {
            // Stat Prefixes
            strong: { name: '強壯的', type: 'stat', effects: [{ stat: 'strength', value: 1.1, type: 'multiplier' }], conflicts: ['savage', 'assassin'] },
            agile: { name: '靈巧的', type: 'stat', effects: [{ stat: 'agility', value: 1.1, type: 'multiplier' }], conflicts: ['troll'] },
            wise: { name: '智慧的', type: 'stat', effects: [{ stat: 'intelligence', value: 1.1, type: 'multiplier' }], conflicts: ['savage'] },
            lucky: { name: '幸運的', type: 'stat', effects: [{ stat: 'luck', value: 1.1, type: 'multiplier' }], conflicts: [] },
            sturdy: { name: '堅固的', type: 'stat', effects: [{ stat: 'hp', value: 1.1, type: 'multiplier' }], conflicts: ['troll'] },
            savage: { name: '野蠻的', type: 'stat', effects: [{ stat: 'strength', value: 1.25, type: 'multiplier' }, { stat: 'intelligence', value: 0.8, type: 'multiplier' }], conflicts: ['strong', 'wise', 'assassin'] },
            assassin: { name: '刺客的', type: 'stat', effects: [{ stat: 'agility', value: 1.25, type: 'multiplier' }, { stat: 'strength', value: 0.8, type: 'multiplier' }], conflicts: ['strong', 'savage'] },
            troll: { name: '巨魔的', type: 'stat', effects: [{ stat: 'hp', value: 1.25, type: 'multiplier' }, { stat: 'agility', value: 0.8, type: 'multiplier' }], conflicts: ['agile', 'sturdy'] },
            kings: { name: '哥布林王的', type: 'stat', effects: [{ stat: 'all', value: 1.05, type: 'multiplier' }], conflicts: [] },
            // Proc Prefixes
            vampiric: { name: '吸血的', type: 'proc', procInfo: { baseRate: 10, type: 'vampiric', value: 0.5 } }, // 吸取造成傷害的50%
            spiky: { name: '尖刺的', type: 'proc', procInfo: { baseRate: 10, type: 'thorns', value: 0.1 } }, // 反彈自身最大生命值10%的傷害
            multi_hit: { name: '連擊的', type: 'proc', procInfo: { baseRate: 5, type: 'multi_hit' } },
            devastating: { name: '毀滅的', type: 'proc', procInfo: { type: 'devastating', value: 1.5 } }, // 爆擊傷害變為1.5倍(基礎)
            regenerating: { name: '再生的', type: 'proc', procInfo: { type: 'regenerating', value: 0.05 } }, // 每回合恢復5%最大生命值
            blocking: { name: '格擋的', type: 'proc', procInfo: { baseRate: 5, type: 'blocking' } },
            penetrating: { name: '穿透的', type: 'proc', procInfo: { baseRate: 10, type: 'penetrating', value: 0.05 } }, // 造成目標最大生命值5%的額外傷害
        };
        
        const BASE_EQUIPMENT_STATS = {
            metal: {
                '劍':   { 1: { damage: 6 }, 2: { damage: 11 }, 3: { damage: 20 }, 4: { damage: 36 }, 5: { damage: 65 }, 6: { damage: 117 }, 7: { damage: 210 } },
                '雙手劍': { 1: { damage: 10 }, 2: { damage: 18 }, 3: { damage: 32 }, 4: { damage: 58 }, 5: { damage: 104 }, 6: { damage: 187 }, 7: { damage: 337 } },
                '長槍': { 1: { damage: 8 }, 2: { damage: 14 }, 3: { damage: 25 }, 4: { damage: 45 }, 5: { damage: 81 }, 6: { damage: 146 }, 7: { damage: 263 } },
                '弓':   { 1: { damage: 8 }, 2: { damage: 14 }, 3: { damage: 25 }, 4: { damage: 45 }, 5: { damage: 81 }, 6: { damage: 146 }, 7: { damage: 263 } },
                '法杖': { 1: { damage: 8 }, 2: { damage: 14 }, 3: { damage: 25 }, 4: { damage: 45 }, 5: { damage: 81 }, 6: { damage: 146 }, 7: { damage: 263 } },
                '盾':   { 1: { hp: 30, damage: 1, blockChance: 5 }, 2: { hp: 54, damage: 2, blockChance: 6 }, 3: { hp: 96, damage: 3, blockChance: 8 }, 4: { hp: 174, damage: 5, blockChance: 10 }, 5: { hp: 312, damage: 8, blockChance: 12 }, 6: { hp: 562, damage: 13, blockChance: 15 }, 7: { hp: 1011, damage: 21, blockChance: 20 } },
                '鎧甲': { 1: { hp: 40, damage: 2 }, 2: { hp: 72, damage: 3 }, 3: { hp: 128, damage: 5 }, 4: { hp: 230, damage: 8 }, 5: { hp: 414, damage: 13 }, 6: { hp: 745, damage: 21 }, 7: { hp: 1341, damage: 34 } }
            },
            wood: {
                '劍':   { 1: { damage: 5, hp: 6 }, 2: { damage: 9, hp: 12 }, 3: { damage: 16, hp: 24 }, 4: { damage: 29, hp: 42 }, 5: { damage: 52, hp: 78 }, 6: { damage: 94, hp: 138 }, 7: { damage: 169, hp: 246 } },
                '雙手劍': { 1: { damage: 8, hp: 12 }, 2: { damage: 14, hp: 24 }, 3: { damage: 26, hp: 36 }, 4: { damage: 46, hp: 72 }, 5: { damage: 83, hp: 126 }, 6: { damage: 150, hp: 222 }, 7: { damage: 270, hp: 402 } },
                '長槍': { 1: { damage: 6, hp: 12 }, 2: { damage: 11, hp: 18 }, 3: { damage: 20, hp: 30 }, 4: { damage: 37, hp: 48 }, 5: { damage: 66, hp: 90 }, 6: { damage: 119, hp: 162 }, 7: { damage: 214, hp: 294 } },
                '弓':   { 1: { damage: 6, hp: 12 }, 2: { damage: 11, hp: 18 }, 3: { damage: 20, hp: 30 }, 4: { damage: 37, hp: 48 }, 5: { damage: 66, hp: 90 }, 6: { damage: 119, hp: 162 }, 7: { damage: 214, hp: 294 } },
                '法杖': { 1: { damage: 6, hp: 12 }, 2: { damage: 11, hp: 18 }, 3: { damage: 20, hp: 30 }, 4: { damage: 37, hp: 48 }, 5: { damage: 66, hp: 90 }, 6: { damage: 119, hp: 162 }, 7: { damage: 214, hp: 294 } },
                '盾':   { 1: { hp: 36, blockChance: 3 }, 2: { hp: 66, blockChance: 4 }, 3: { hp: 114, blockChance: 5 }, 4: { hp: 204, blockChance: 6 }, 5: { hp: 366, blockChance: 7 }, 6: { hp: 660, blockChance: 8 }, 7: { hp: 1188, blockChance: 10 } },
                '鎧甲': { 1: { hp: 52 }, 2: { hp: 90 }, 3: { hp: 158 }, 4: { hp: 278 }, 5: { hp: 492 }, 6: { hp: 882 }, 7: { hp: 1584 } }
            }
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
        // 【新增此函數】
        function distributeStatsWithFemaleKnightRatio(totalPoints, baseRatio) {
            const stats = { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 0 };
            const statKeys = ['strength', 'agility', 'intelligence', 'luck', 'charisma'];
            
            // 將基礎的4項比值與新的魅力比值:3結合
            const finalRatio = [...baseRatio, 3];
            const totalRatio = finalRatio.reduce((a, b) => a + b, 0);
            let pointsRemaining = totalPoints;

            if (totalRatio === 0) {
                // 如果基礎比值有問題，則退回平均分配
                return distributeStats(totalPoints, statKeys);
            }

            for (let i = 0; i < finalRatio.length; i++) {
                const pointsForStat = Math.floor(totalPoints * (finalRatio[i] / totalRatio));
                stats[statKeys[i]] = pointsForStat;
                pointsRemaining -= pointsForStat;
            }

            // 將分配後剩餘的點數隨機加到5項能力值上
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
                // 【修改】分別生成髮色與髮型，並移除舊的hair屬性
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
            // 倉庫與背包的道具容量
            warehouse: [10, 20, 40, 80, 160],
            // 資源（食物、木材、礦石）的儲存上限
            storage: [200, 500, 1000, 2000, 4000],
            // 地牢與產房的人口容量
            dungeon: [0, 5, 10, 15, 20, 25, 30],
            // 寢室的夥伴容量
            barracks: [5, 10, 20, 30, 40, 50]
        };