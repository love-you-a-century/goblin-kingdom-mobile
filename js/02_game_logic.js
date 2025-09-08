function filterInventory(inventory, filter) {
    if (filter === 'all') return inventory;
    return inventory.filter(item => {
        if (filter === 'weapon') return item.slot === 'mainHand';
        if (filter === 'shield') return item.baseName === '盾';
        if (filter === 'armor') return item.slot === 'chest';
        return true;
    });
}

const gameLogic = {
    // --- 導入所有模組 ---
    ...combatModule,
    ...raidModule,
    ...tribeModule,
    ...itemModule,
    ...unitManagerModule,
    ...narrativeModule,
    ...uiModule,
    ...skillModule,

    // --- 核心遊戲狀態 (王國的國庫、人口和時間) ---
    screen: 'api_key_input', // 將初始畫面改為 API 輸入介面
    userApiKey: '',          // 用來儲存玩家輸入的金鑰
    player: null,
    partners: [],
    captives: [],
    resources: { food: 200, wood: 200, stone: 200 },
    warehouseInventory: [],
    day: 1,//日
    year: 0,//年
    month: 1,//月
    currentDate: 1,
    buildings: {
        dungeon: { level: 0, name: "地牢" },
        warehouse: { level: 0, name: "倉庫" },
        barracks: { level: 0, name: "寢室" },
        armory: { level: 0, name: "兵工廠" },
        trainingGround: { level: 0, name: "訓練場" }, 
        merchantCamp: { level: 0, name: "商人營地" },
        watchtower: { level: 0, name: "哨塔" },
    },
    dispatch: {//派遣系統
        hunting: [], // 打獵隊伍
        logging: [], // 伐木隊伍
        mining: [],  // 採礦隊伍
        watchtower: [], // 哨塔派駐隊伍
    },

    // --- 遊戲中的各種旗標和暫存資料 ---
    pendingDecisions: [],
    dlc: {
        hells_knights: false // 「王國騎士團」DLC，預設為未解鎖
    },
    bailoutCounter: 0, // 用來計算玩家求助的次數
    totalBreedingCount: 0, // 用於追蹤觸發使徒BOSS戰的總繁衍次數
    flags: {
        defeatedApostle: false,
        defeatedGoddess: false
    },
    isStarving: false,
    narrativeMemory: '',
    hasSaveFile: false,
    isNewGame: true, 
    postBattleBirths: [], 
    logs: {
        tribe: [],
        raid: [],
        combat: []
    },

    // --- 掠奪地圖專用狀態 ---
    currentRaid: null,
    raidTimeExpired: false, // 用來標記時間是否在戰鬥中耗盡
    isRetreatingWhenTimeExpired: false, // 記錄時間耗盡時是否正在脫離
    playerMapPosition: { x: -100, y: -100 }, // 玩家在地圖上的位置，預設在畫面外
    selectedTarget: null, // 當前選中的目標 (建築或敵人)
    isCombatLocked: false, // 是否被巡邏隊鎖定，無法移動
    mapScale: 1, // 用於地圖縮放

    // --- 各類 UI 視窗的狀態 ---
    modals: {
        dice: {
            isOpen: false,
            title: '',      // 視窗標題，例如 "攻擊判定"
            sides: { player: [], opponent: [] },
            showButton: false, // 是否顯示確認按鈕
            onComplete: null, // 動畫結束後的回呼函式
            avatarUrl: null,
        },
        dispatch: { isOpen: false, activeTab: 'hunting' }, // 派遣系統 modal
        construction: { isOpen: false, activeTab: 'dungeon' },
        skillTree: { isOpen: false, activeTab: 'combat' },
        combatSkills: { isOpen: false },
        dungeon: { subTab: 'manage', selectedBreedIds: [], activeFilter: 'all' },
        barracks: { subTab: 'manage', selectedPartyIds: [] },
        partnerEquipment: { isOpen: false, partnerId: null, activeFilter: 'all' },
        warehouse: { subTab: 'manage', activeFilter: 'all' },
        armory: { subTab: 'craft', craftingType: '劍', craftingTier: 1 },
        maternity: { subTab: 'manage' },
        merchant: { isOpen: false },
        scoutInfo: { isOpen: false, target: null, emptyBuildingMessage: '' },
        captiveManagement: { isOpen: false, title: '', list: [], limit: 0, selectedIds: [], type: '', context: null },
        narrative: { isOpen: false, title: '', content: '', isLoading: false, hasBred: false, context: [], currentCaptives: [], type: '', isAwaitingConfirmation: false },
        customAlert: { isOpen: false, message: '', onConfirm: null },
        discardConfirm: { isOpen: false, itemId: null, itemName: '' },
        raidStatus: { isOpen: false, activeTab: 'status', activeFilter: 'all' },
        throneScout: { isOpen: false, unit: null },
        itemManagement: { isOpen: false, title: '', message: '', items: [], capacity: 0, onConfirm: null },
        raidCaptives: { isOpen: false },
        partnerManagement: { isOpen: false, list: [], limit: 0, selectedIds: [], newbornId: null, context: null },
        bailoutConfirm: {
            isOpen: false,
            messages: [], // 要問的問題列表
            currentMessageIndex: 0, // 當前問題的索引
            onConfirm: null // 確認到底後要執行的動作
        },
        exportSave: { isOpen: false, data: '' },
    },

    // --- 角色創建/重生專用狀態 ---
    creation: {
        name: '哥布林王', height: 130, penisSize: 10,
        appearance: '有著一對尖耳朵、狡猾的眼神、戴著骨頭項鍊的綠皮膚哥布林',
        stats: { strength: 10, agility: 10, intelligence: 10, luck: 10 },
        statWarningMessage: '',
        lowStatWarnings: {},
        get pointsRemaining() { return 40 - Object.values(this.stats).reduce((a, b) => a + b, 0); }
    },
    rebirth: {//用於重生畫面的資料物件
        name: '',
        height: 0,
        penisSize: 0,
        appearance: '',
        stats: { strength: 1, agility: 1, intelligence: 1, luck: 1 },
        totalPoints: 0, // 總點數將在觸發重生時計算
        get pointsRemaining() { 
            return this.totalPoints - Object.values(this.stats).reduce((a, b) => a + b, 0); 
        }
    },

    // --- 商人狀態 ---
    merchant: { 
        dialogue: '', // 用來存放當前對話
        avatar: null, // 用來存放當前頭像路徑
        throneRoomUnits: [],
        isPresent: false,
        goods: [],
        stayDuration: 0,
        purchases: 0, // 用於追蹤彩蛋
        selectedItemIds: [], // 改為陣列以支援複選
        selectedCaptiveIds: [],
    },

    // --- 教學狀態 ---
    tutorial: {
        active: false, // 總開關，判斷玩家是否需要教學
        pendingTutorial: null, //   用於存放待處理的教學事件
        // --- 以下為各教學模組的完成狀態旗標 ---
        finishedIntro: false,         // 完成初級教學 (建築->掠奪->繁衍)
        finishedPartyMgmt: false,     // 完成夥伴管理教學
        finishedEquipping: false,     // 完成裝備教學
        finishedDecomposing: false,   // 完成分解教學
        finishedAttributePoints: false, // 完成屬性點教學
        // 保留商人旗標
        merchantMet: false
    },

    // --- 其他狀態... ---
    tempStatIncreases: { strength: 0, agility: 0, intelligence: 0, luck: 0 },
    musicSettings: {
        src: null,
        isPlaying: false,
        playOnScreen: 'tribe', // 預設在部落畫面播放
    },
    knightPositions: {
        '騎士': { top: '40%', left: '50%' }, // V字陣型頂點
        '槍兵': { top: '50%', left: '35%' }, // 第二排左
        '士兵': { top: '50%', left: '65%' }, // 第二排右
        '盾兵': { top: '60%', left: '20%' }, // 第三排左
        '祭司': { top: '60%', left: '80%' }, // 第三排右 (後排輔助)
        '弓兵': { top: '70%', left: '5%' },  // 第四排左 (遠程)
        '法師': { top: '70%', left: '95%' }, // 第四排右 (遠程)
    },
    raidOptions: [
        { difficulty: 'easy', name: '簡單', description: '居民(15-20), 守軍(5-10)' },
        { difficulty: 'normal', name: '普通', description: '居民(20-25), 守軍(10-15)' },
        { difficulty: 'hard', name: '困難', description: '居民(25-30), 守軍(15-20)' },
        { difficulty: 'hell', name: '地獄', description: '居民(30-35), 守軍(20-25)' },
    ],
    craftableTypes: [
        // 武器
        { baseName: '劍', type: 'weapon', slot: 'mainHand', materialCategory: 'metal' },
        { baseName: '雙手劍', type: 'weapon', slot: 'mainHand', materialCategory: 'metal' },
        { baseName: '長槍', type: 'weapon', slot: 'mainHand', materialCategory: 'wood' },
        { baseName: '弓', type: 'weapon', slot: 'mainHand', materialCategory: 'wood' },
        { baseName: '法杖', type: 'weapon', slot: 'mainHand', materialCategory: 'wood' },
        { baseName: '盾', type: 'weapon', slot: 'offHand', materialCategory: 'metal' },
        // 防具
        { baseName: '鎧甲', type: 'armor', slot: 'chest', armorType: 'plate', materialCategory: 'metal' },
        { baseName: '皮甲', type: 'armor', slot: 'chest', armorType: 'leather', materialCategory: 'leather' },
        { baseName: '布服', type: 'armor', slot: 'chest', armorType: 'cloth', materialCategory: 'cloth' },
    ],

    // --- 計算屬性 (王國的即時統計數據) ---
    get warehouseCapacity() { 
        return CAPACITY_LEVELS.warehouse[this.buildings.warehouse.level] || 0;
    },
    get backpackCapacity() {
        // 背包容量永遠跟倉庫容量同步
        return this.warehouseCapacity;
    },
    get captiveCapacity() { 
        return CAPACITY_LEVELS.dungeon[this.buildings.dungeon.level] || 0;
    },
    get partnerCapacity() { 
        return CAPACITY_LEVELS.barracks[this.buildings.barracks.level] || 0;
    },
    get foodCapacity() { 
        return CAPACITY_LEVELS.storage[this.buildings.warehouse.level] || 0;
    },
    get woodCapacity() { 
        // 木材容量永遠跟食物容量同步
        return this.foodCapacity; 
    },
    get stoneCapacity() { 
        // 礦石容量永遠跟食物容量同步
        return this.foodCapacity; 
    },
    get dailyFoodConsumption() {
        if (!this.player) return 0;
        const allMembers = [this.player, ...this.partners, ...this.captives];
        return allMembers.reduce((total, member) => {
            let statSum = member.stats.strength + member.stats.agility + member.stats.intelligence + member.stats.luck;
            if (member.stats.charisma) {
                statSum += member.stats.charisma;
            }
            return total + Math.floor(statSum / 10);
        }, 0);
    },
    getUnitFoodConsumption(unit) {
        if (!unit || !unit.stats) return 0;
        let statSum = (unit.stats.strength || 0) + (unit.stats.agility || 0) + (unit.stats.intelligence || 0) + (unit.stats.luck || 0);
        if (unit.stats.charisma) {
            statSum += unit.stats.charisma;
        }
        return Math.floor(statSum / 10);
    },
    get totalBreedingCharges() {
        if (!this.player) return 1;
        //  將 getTotalStat('luck') 改為 stats.luck，只計算玩家本體原始點數
        return 1 + Math.floor(this.player.stats.luck * 0.1);
    },
    get carryCapacity() {
        if (!this.player) return 0;
        return (this.player.party.length + 1) * 2;
    },
    get dungeonCaptives() {
        return this.captives.filter(c => !c.isPregnant && !c.isMother);
    },
    get filteredCaptives() {
        const filter = this.modals.dungeon.activeFilter;
        if (filter === 'all') {
            return this.captives;
        }
        if (filter === 'breedable') {
            // 這個邏輯和原本的 dungeonCaptives 相同
            return this.captives.filter(c => !c.isPregnant && !c.isMother);
        }
        if (filter === 'pregnant') {
            return this.captives.filter(c => c.isPregnant);
        }
        if (filter === 'mother') {
            // 只顯示產奶中 (是母親但沒有懷孕)
            return this.captives.filter(c => !c.isPregnant && c.isMother);
        }
        return this.captives; // 如果發生意外，預設回傳全部
    },
    get mothers() {
        return this.captives.filter(c => c.isPregnant || c.isMother);
    },
    get potentialTrainingPoints() {
        if (!this.player) return 0;
        const rawStatSum = this.player.stats.strength + this.player.stats.agility + this.player.stats.intelligence + this.player.stats.luck;
        return Math.floor(rawStatSum / 4);
    },
    getPartyAverageStats(unitList) {
        if (!unitList || unitList.length === 0) {
            return { strength: 0, agility: 0, intelligence: 0, luck: 0, average: 0 };
        }
        const totalStats = unitList.reduce((totals, unit) => {
            totals.strength += unit.getTotalStat('strength', this.isStarving);
            totals.agility += unit.getTotalStat('agility', this.isStarving);
            totals.intelligence += unit.getTotalStat('intelligence', this.isStarving);
            totals.luck += unit.getTotalStat('luck', this.isStarving);
            return totals;
        }, { strength: 0, agility: 0, intelligence: 0, luck: 0 });

        const avgStrength = totalStats.strength / unitList.length;
        const avgAgility = totalStats.agility / unitList.length;
        const avgIntelligence = totalStats.intelligence / unitList.length;
        const avgLuck = totalStats.luck / unitList.length;
        
        //計算最終的綜合平均值
        const finalAverage = (avgStrength + avgAgility + avgIntelligence + avgLuck) / 4;

        return {
            strength: avgStrength,
            agility: avgAgility,
            intelligence: avgIntelligence,
            luck: avgLuck,
            average: finalAverage
        };
    },
    get canScoutEnvironment() {
        if (!this.currentRaid || !this.currentRaid.currentZone) {
            return false;
        }
        const zone = this.currentRaid.currentZone;
        const hasHiddenBuildings = zone.buildings.some(b => b.scoutState === 'hidden');
        const hasHiddenEnemies = zone.enemies.some(group => group.length > 0 && group[0].scoutState === 'hidden');
        // 只要還有任何隱藏的目標，按鈕就應該是可用的 (所以回傳 true)
        return hasHiddenBuildings || hasHiddenEnemies;
    },
    get learnedActiveSkills() {
        if (!this.player || !this.player.learnedSkills) return [];
        
        const activeSkills = [];
        for (const skillId in this.player.learnedSkills) {
            for (const category in SKILL_TREES) {
                const skillData = SKILL_TREES[category].find(s => s.id === skillId);
                if (skillData && skillData.combatActive) {
                    const playerSkillState = this.player.skills.find(s => s.id === skillId);
                    
                    // --- 核心修改：使用新函式來計算最終冷卻 ---
                    const finalCooldown = this.player.getFinalCooldown(skillData);

                    activeSkills.push({
                        ...skillData,
                        // 使用實例的當前冷卻，如果沒有則為0
                        currentCooldown: playerSkillState ? playerSkillState.currentCooldown : 0,
                        // 顯示給UI的冷卻時間是計算後的最終值
                        cooldown: finalCooldown, 
                        currentLevel: this.player.learnedSkills[skillId]
                    });
                }
            }
        }
        return activeSkills;
    },
    get canExecuteBreeding() {
        if (!this.player) return false; // 安全檢查

        const selectedCount = this.modals.dungeon.selectedBreedIds.length;

        if (selectedCount === 0) return true; // 如果沒選人，按鈕應該是可用的（但點了會提示）
        if (selectedCount > this.breedingChargesLeft) return true;
        if (this.maternityCapacity === 0) return true;
        if ((this.mothers.length + selectedCount) > this.maternityCapacity) return true;
        
        return false; // 所有條件都滿足，按鈕不禁用
    },
    get isMerchantButtonDisabled() {// 判斷「商人營地」按鈕是否應該被禁用
        return !this.merchant.isPresent;
    },
    get shouldRaidButtonGlow() {// 判斷「出擊掠奪」按鈕是否應該發光
        return this.tutorial.active && this.tutorial.step === 5;
    },
    get shouldConstructionButtonGlow() {// 判斷「部落建設」按鈕是否應該發光
        return this.tutorial.active && this.tutorial.step === 2;
    },
    get currentlyEditingPartner() {
        if (!this.modals.partnerEquipment.partnerId) return null;
        
        //   判斷目標是否為玩家本人
        if (this.modals.partnerEquipment.partnerId === 'player') {
            return this.player;
        }
        
        // 維持原有邏輯，尋找夥伴
        return this.partners.find(p => p.id === this.modals.partnerEquipment.partnerId);
    },
    get filteredWarehouseInventory() {
        return filterInventory(this.warehouseInventory, this.modals.warehouse.activeFilter);
    },
    get filteredPlayerInventory() {
        if (!this.player) return [];
        return filterInventory(this.player.inventory, this.modals.warehouse.activeFilter);
    },
    get filteredPartnerWarehouse() {
        return filterInventory(this.warehouseInventory, this.modals.partnerEquipment.activeFilter);
    },
    get filteredPartnerBackpack() {
        if (!this.player) return [];
        return filterInventory(this.player.inventory, this.modals.partnerEquipment.activeFilter);
    },
    getUnitColor(unitOrGroup) {
        const unit = Array.isArray(unitOrGroup) ? unitOrGroup[0] : unitOrGroup;
        if (!unit) return 'bg-gray-500'; // 安全備用
        if (unit.id === this.player.id) return 'bg-green-500';
        if (unit.profession === '公主') return 'bg-yellow-400';
        if (Object.keys(KNIGHT_ORDER_UNITS).includes(unit.profession)) return 'bg-orange-500';
        if (unit.profession === '城市守軍') return 'bg-red-500';
        return 'bg-white'; // 居民
    },
    getInteractionMenuPosition() {
        if (!this.selectedTarget) return 'left: -999px; top: -999px;'; // 如果沒有目標，則移出畫面外

        const menuWidth = 100;
        const menuHeight = 80;
        const offsetX = 10;
        const offsetY = 10;

        let anchorX, anchorY;
        if (Array.isArray(this.selectedTarget)) {
            anchorX = this.selectedTarget[0].x;
            anchorY = this.selectedTarget[0].y;
        } else {
            anchorX = this.selectedTarget.x + (this.selectedTarget.width / 2);
            anchorY = this.selectedTarget.y + this.selectedTarget.height;
        }

        let targetX = anchorX + offsetX;
        let targetY = anchorY - offsetY - menuHeight;

        if (targetX + menuWidth > MAP_WIDTH) {
            targetX = anchorX - offsetX - menuWidth;
        }
        if (targetY < 0) {
            targetY = anchorY + offsetY;
        }

        return `left:${targetX}px; top:${targetY}px;`;
    },
    get selectedItems() {
        if (!this.merchant.selectedItemIds || this.merchant.selectedItemIds.length === 0) return [];
        const selectedSet = new Set(this.merchant.selectedItemIds);
        return this.merchant.goods.filter(g => selectedSet.has(g.id));
    },
    get selectedItemsValue() {
        // --- 過濾掉免費商品 ---
        let totalValue = this.selectedItems
            .filter(item => !item.isFree) 
            .reduce((total, item) => total + this.calculateEquipmentValue(item), 0);

        const skillId = 'tribe_negotiation';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillLevel = this.player.learnedSkills[skillId];
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            const reduction = skillData.levels[skillLevel - 1].effect.price_reduction;
            totalValue = Math.floor(totalValue * (1 - reduction));
        }

        return totalValue;
    },
    get selectedCaptives() {
        if (!this.merchant.selectedCaptiveIds || this.merchant.selectedCaptiveIds.length === 0) return [];
        const selectedSet = new Set(this.merchant.selectedCaptiveIds);
        // 從總俘虜名單中尋找
        return this.captives.filter(c => selectedSet.has(c.id));
    },
    get selectedCaptivesValue() {
        return this.selectedCaptives.reduce((total, captive) => total + this.calculateCaptiveValue(captive), 0);
    },
    get canExecuteTrade() {
        //  更新判斷條件以適應複選
        return this.merchant.selectedItemIds.length > 0 && this.merchant.selectedCaptiveIds.length > 0 && this.selectedCaptivesValue >= this.selectedItemsValue;
    },
    get availableCraftingOptions() {
        if (this.buildings.armory.level === 0) return [];

        // 1. 取得當前兵工廠等級能製作的最高階級
        const tierMap = [0, 1, 3, 5, 7];
        const maxTier = tierMap[this.buildings.armory.level] || 0;
        
        // 2. 取得當前選擇的裝備類型，並找出它對應的材質分類 (metal, wood, etc.)
        const selectedType = this.craftableTypes.find(t => t.baseName === this.modals.armory.craftingType);
        if (!selectedType) return [];
        const category = selectedType.materialCategory;

        // 3. 遍歷所有材質，找出所有符合 分類(category) 和 最高階級(maxTier) 的材質
        const options = [];
        for (const key in EQUIPMENT_MATERIALS) {
            const mat = EQUIPMENT_MATERIALS[key];
            if (mat.category === category && mat.tier <= maxTier) {
                options.push({
                    tier: mat.tier,
                    name: mat.name
                });
            }
        }
        
        // 4. 按階級排序並回傳結果
        return options.sort((a, b) => a.tier - b.tier);
    },
    getCraftingCost() {
        const tier = this.modals.armory.craftingTier;
        if (!tier) return { food: 0, wood: 0, stone: 0 };
        return CRAFTING_COSTS[tier] || { food: 0, wood: 0, stone: 0 };
    },
    get canAffordCraft() {
        const cost = this.getCraftingCost();
        // 檢查所有資源是否都足夠
        return this.resources.food >= cost.food && 
            this.resources.wood >= cost.wood && 
            this.resources.stone >= cost.stone;
    },
    get availablePartnersForDispatch() {//更新這個計算屬性，讓它排除所有已指派的夥伴
        // 取得所有未被派遣的夥伴
        const dispatchedIds = new Set([
            ...this.dispatch.hunting,
            ...this.dispatch.logging,
            ...this.dispatch.mining,
            ...this.dispatch.watchtower // 加入哨塔成員
        ]);
        return this.partners.filter(p => !dispatchedIds.has(p.id));
    },

    get availablePartnersForParty() {
        // 這份清單只會顯示「沒有」被派遣的哥布林
        const dispatchedIds = new Set([
            ...this.dispatch.hunting,
            ...this.dispatch.logging,
            ...this.dispatch.mining
        ]);
        return this.partners.filter(p => !dispatchedIds.has(p.id));
    },
    getDispatchedPartners(task) {
        // 根據任務類型取得已被派遣的夥伴列表
        const partnerMap = new Map(this.partners.map(p => [p.id, p]));
        return this.dispatch[task].map(id => partnerMap.get(id)).filter(Boolean);
    },
    get filteredRaidInventory() {
        if (!this.player) return [];
        // 直接複用現有的 filterInventory 函式
        return filterInventory(this.player.inventory, this.modals.raidStatus.activeFilter);
    },

    // --- 核心生命週期函式 (王國的運轉核心) ---
    init() {
        this.loadApiKey();
        this.logMessage('tribe', "哥布林王國v5.61 初始化...");
        this.checkForSaveFile();
        this.$watch('screen', (newScreen) => {
            // 當玩家回到部落畫面，且有待辦事項時
            if (newScreen === 'tribe' && this.pendingDecisions.length > 0) {
                // 使用 setTimeout 確保畫面已完全切換，避免彈窗閃爍
                setTimeout(() => this.processNextDecision(), 100);
            }
        });
        this.$watch('modals.construction.isOpen', (isOpen) => {
            if (!isOpen && this.bailoutOfferedButRefused) {
                this.bailoutOfferedButRefused = false; 
                setTimeout(() => {
                    this.handleBailoutRequest();
                }, 200);
            }
            
            if (isOpen && this.player && this.modals.construction.activeTab === 'barracks') {
                this.modals.barracks.selectedPartyIds = this.player.party.map(p => p.id);
            }
        });
        this.$watch('modals.construction.activeTab', (newTab) => {
            if (newTab === 'barracks' && this.player) {
                this.modals.barracks.selectedPartyIds = this.player.party.map(p => p.id);
            }
        });
        this.$watch('modals.merchant.isOpen', (isOpen) => {
            if (!isOpen) {
                clearTimeout(this.merchantDialogueTimeout);
            }
        });

        // 【智慧播放監聽器】
        this.$watch('screen', (newScreen) => {
            // 當前畫面符合設定時，且音樂是播放狀態，就播放
            if (newScreen === this.musicSettings.playOnScreen && this.musicSettings.isPlaying) {
                if (this.$refs.audioPlayer.paused) {
                    this.$refs.audioPlayer.currentTime = 0; // 【新增此行】將音樂拉回開頭
                    this.$refs.audioPlayer.play().catch(e => {});
                }
            } else { // 否則就暫停
                if (!this.$refs.audioPlayer.paused) {
                    this.$refs.audioPlayer.pause();
                }
            }
        });
    },
    initializeTribe() {
        if (!this.isNewGame) return;
        this.isNewGame = false;

        this.player.updateHp(this.isStarving);

        const starterSword = this.createEquipment('iron', 'worn', '劍');
        const starterArmor = this.createEquipment('iron', 'worn', '鎧甲');
        this.player.inventory.push(starterSword);
        this.player.inventory.push(starterArmor);
        
        this.logMessage('tribe', `你在空無一人的破舊部落中醒來，在一個腐朽的箱子裡發現了[${starterSword.name}]和[${starterArmor.name}]。`, 'system');

        const zeroStats = Object.keys(this.player.stats).filter(stat => ['strength', 'agility', 'intelligence', 'luck'].includes(stat) && this.player.stats[stat] === 0);
        const zeroStatCount = zeroStats.length;
        let itemToGenerate = null;

        if (zeroStatCount >= 3) {
            itemToGenerate = {
                slot: 'chest',
                baseName: '鎧甲',
                affix: 'henshin_curse',
                alert: '你感覺自己彷彿能變身成什麼，身上憑空出現了一件鎧甲...'
            };
        } else if (zeroStatCount === 2) {
            itemToGenerate = {
                slot: 'offHand',
                baseName: '盾',
                affix: 'gundam_curse',
                alert: '你感覺自己內心深處的某種東西覺醒了，手中憑空出現了一面盾...'
            };
        } else if (zeroStatCount === 1) {
            const stat = zeroStats[0];
            const itemMap = {
                strength: { baseName: '劍', affix: 'strength_curse', alert: '你感覺身體格外虛弱，但手中憑空出現了一把劍...' },
                agility: { baseName: '弓', affix: 'agility_curse', alert: '你感覺身體格外遲鈍，但手中憑空出現了一把弓...' },
                intelligence: { baseName: '法杖', affix: 'intelligence_curse', alert: '你感覺思緒一片混沌，但手中憑空出現了一把法杖...' },
                luck: { baseName: '長槍', affix: 'luck_curse', alert: '你感覺厄運纏身，但手中憑空出現了一把長槍...' },
            };
            if (itemMap[stat]) {
                itemToGenerate = { slot: 'mainHand', ...itemMap[stat] };
            }
        }

        const startTribeActions = () => {
            if (itemToGenerate) {
                const cursedItem = this.createEquipment('iron', 'worn', itemToGenerate.baseName, itemToGenerate.affix);
                this.player.equipment[itemToGenerate.slot] = cursedItem;
                this.logMessage('tribe', `你獲得了受詛咒的裝備：[${cursedItem.name}]！`, 'system');
                this.player.updateHp();
            }

            if (this.tutorial.active) {
                this.advanceTutorial(1);
            } else {
                this.logMessage('tribe', `第 ${this.day} 天：偉大的哥布林王 ${this.player.name} 的傳奇開始了！`, 'system');
            }
        };

        if (itemToGenerate) {
            this.showCustomAlert(itemToGenerate.alert, startTribeActions);
        } else {
            startTribeActions();
        }
        this.breedingChargesLeft = this.totalBreedingCharges;

        if (this.tutorial.pendingTutorial) {
            this.triggerTutorial(this.tutorial.pendingTutorial);
        }
    },
    async createCharacter() {
            // 檢查剩餘點數是否剛好為 0
        if (this.creation.pointsRemaining < 0) {
            this.showCustomAlert(`你的能力點數總和超過40點了！請重新分配。`);
            return; // 中斷創建
        }
        if (this.creation.pointsRemaining > 0) {
            this.showCustomAlert(`你還有 ${this.creation.pointsRemaining} 點能力點尚未分配！`);
            return; // 中斷創建
        }
        this.player = new Player(this.creation.name, this.creation.stats, this.creation.appearance, this.creation.height, this.creation.penisSize);
        const encodedName = encodeURIComponent(this.player.name);
        this.player.avatarUrl = `https://placehold.co/400x400/2d3748/cbd5e0?text=哥布林王\\n${encodedName}`;

        // 先切換畫面
        this.screen = 'birth_narrative';

        // 然後使用 $nextTick 確保新畫面渲染完成後，再設定其內部狀態
        this.$nextTick(() => {
            const modal = this.modals.narrative;
            modal.isAwaitingConfirmation = true;
            modal.isLoading = false;
            modal.content = '';
        });
    },
    initiateRebirth() {//觸發重生的函式
        this.logMessage('tribe', `${this.player.name} 在戰鬥中倒下了... 但哥布林的生命力讓你從死亡邊緣歸來！`, 'system');
        
        // 1. 計算總能力點數
        const total = Object.values(this.player.stats).reduce((a, b) => a + b, 0);
        this.rebirth.totalPoints = total;

        // 2. 載入當前外觀設定
        this.rebirth.name = this.player.name;
        this.rebirth.height = this.player.height;
        this.rebirth.penisSize = this.player.penisSize;
        this.rebirth.appearance = this.player.appearance;

        // 3. 預設將點數設為最低值 1，其餘為待分配
        this.rebirth.stats = { strength: 1, agility: 1, intelligence: 1, luck: 1 };
        
        // 4. 切換至重生畫面
        this.screen = 'rebirth';
        this.showCustomAlert('你獲得了重塑自身的機會！');
    },
    confirmRebirth() {//確認重生設定的函式
        if (this.rebirth.pointsRemaining !== 0) {
            this.showCustomAlert(`你還有 ${this.rebirth.pointsRemaining} 點能力點尚未分配！`);
            return;
        }

        // 更新玩家資料
        this.player.height = this.rebirth.height;
        this.player.penisSize = this.rebirth.penisSize;
        this.player.appearance = this.rebirth.appearance;
        this.player.stats = this.rebirth.stats;

        // 恢復狀態並返回部落
        this.player.updateHp(this.isStarving);
        this.player.currentHp = this.player.maxHp;
        this.screen = 'tribe';
        this.logMessage('tribe', '你重塑了肉體與靈魂，以全新的姿態重生！', 'success');
    },
    updateStat(stat, value) {
        const MAX_INDIVIDUAL_STAT = 100; // 設定單項能力值的上限

        // 1. 處理並淨化輸入值
        let intValue = parseInt(value);
        if (isNaN(intValue)) {
            intValue = 0; // 將英文、亂碼等無效輸入轉換為 0
        }

        // 2. 驗證單項能力值的上下限 (0 ~ 100)
        if (intValue < 0) {
            intValue = 0;
        }
        if (intValue > MAX_INDIVIDUAL_STAT) {
            intValue = MAX_INDIVIDUAL_STAT;
        }

        // 3. 驗證總點數 (40點) 的上限
        const currentStatValue = this.creation.stats[stat];
        const difference = intValue - currentStatValue; // 計算使用者想增加多少點

        // 如果想增加的點數(difference > 0) 超過了剩餘可用點數...
        if (difference > 0 && difference > this.creation.pointsRemaining) {
            // ...則只允許增加剩餘的點數
            intValue = currentStatValue + this.creation.pointsRemaining;
        }

        // 4. 更新最終數值
        this.creation.stats[stat] = intValue;
        
        // 5. 更新警告訊息
        this.checkStatValue(stat, intValue);
    },
    updateRebirthStat(stat, value) {//處理重生畫面點數分配的函式
        const intValue = parseInt(value);
        if (!isNaN(intValue) && intValue >= 1) { // 確保點數至少為 1
            this.rebirth.stats[stat] = intValue;
        } else {
            this.rebirth.stats[stat] = 1; // 如果輸入無效，則重設為 1
        }
    },
    checkStatValue(stat, value) {
        // 這個函式現在只負責根據當前的狀態顯示警告，不再修改數值。
        const zeroStatCount = Object.values(this.creation.stats).filter(v => v <= 0).length;

        if (zeroStatCount >= 3) {
            this.creation.statWarningMessage = "只是路過的蒙面哥布林..."; // GDD 4.1
        } else if (zeroStatCount === 2) {
            this.creation.statWarningMessage = "Trans-Goblin..."; // GDD 4.1
        } else if (zeroStatCount === 1) {
            const zeroStatKey = Object.keys(this.creation.stats).find(key => this.creation.stats[key] <= 0);
            switch(zeroStatKey) {
                case 'strength': this.creation.statWarningMessage = "一武洋ㄎ...都能O死你，我不確定你還能站著..."; break;
                case 'agility': this.creation.statWarningMessage = "希望你跟霍ㄐ...一樣有輪椅（這邊好像不該出現這個詞..."; break;
                case 'intelligence': this.creation.statWarningMessage = "我不清楚哥布林能不能理解你，但我肯定不行..."; break;
                case 'luck': this.creation.statWarningMessage = "自古槍兵幸運E，你沒自殺是奇蹟..."; break;
            }
        } else {
            const hasLowStat = Object.values(this.creation.stats).some(v => v > 0 && v <= 4);
            if (hasLowStat) {
                this.creation.statWarningMessage = "我建議你不要，如果你仍執意...";
            } else {
                this.creation.statWarningMessage = '';
            }
        }
    },

    processDailyUpkeep() {
        // --- 日期計算與事件觸發 ---
        this.day++;
        this.year = Math.floor((this.day - 1) / 360) ;
        this.month = Math.floor(((this.day - 1) % 360) / 30) + 1;
        this.currentDate = ((this.day - 1) % 30) + 1;

        this.logMessage('tribe', `--- 第 ${this.year} 年 ${this.month} 月 ${this.currentDate} 日 (總天數: ${this.day}) ---`, 'system');

        if (this.player && this.player.tribeSkillCooldowns) {
            for (const skillId in this.player.tribeSkillCooldowns) {
                if (this.player.tribeSkillCooldowns[skillId] > 0) {
                    this.player.tribeSkillCooldowns[skillId]--;
                }
            }
        }

        if (this.merchant.isPresent) {
            this.merchant.stayDuration--;
            if (this.merchant.stayDuration <= 0) {
                this.logMessage('tribe', '旅行商人「世紀」已經收拾行囊，離開了你的部落。', 'info');
                this.merchant = {
                    dialogue: '',
                    avatar: null, // <-- 重置頭像
                    isPresent: false,
                    goods: [],
                    stayDuration: 0,
                    purchases: this.merchant.purchases,
                    selectedItemIds: [],
                    selectedCaptiveIds: [],
                };
            }
        } else {
            // 原有的商人出現邏輯，保留不變
            if (this.day === 9 && !this.tutorial.merchantMet) {
                this.merchant.isPresent = true;
                this.merchant.stayDuration = 1 + (this.buildings.merchantCamp.level || 0);
                this.generateMerchantGoods();
                this.logMessage('tribe', `一位名叫「世紀」的魅魔商人來到了你的營地！她將停留 ${this.merchant.stayDuration} 天。`, 'success');
                this.advanceTutorial(7);
                this.tutorial.merchantMet = true;
            } else if (this.day > 9) {
                const arrivalChance = [10, 15, 20, 25, 30][this.buildings.merchantCamp.level || 0] || 10;
                if (rollPercentage(arrivalChance)) {
                    this.merchant.isPresent = true;
                    this.merchant.stayDuration = 1 + (this.buildings.merchantCamp.level || 0);
                    this.generateMerchantGoods();
                    this.logMessage('tribe', `一位名叫「世紀」的魅魔商人來到了你的營地！她將停留 ${this.merchant.stayDuration} 天。`, 'success');
                }
            }
        }

        this.checkForEvents();

        this.postBattleBirths = []; 

        this.captives.forEach(c => {
            if (c.isPregnant) {
                let gaveBirthEarly = false;
                const skillId = 'breed_breeding_authority';
                if (this.player && this.player.learnedSkills[skillId]) {
                    const skillData = SKILL_TREES.breeding.find(s => s.id === skillId);
                    if (rollPercentage(skillData.levels[0].effect.chance * 100)) {
                        this.logMessage('tribe', `在「繁衍的權能」影響下，${c.name} 的生產週期瞬間完成了！`, 'crit');
                        this.giveBirth(c);
                        gaveBirthEarly = true;
                    }
                }

                if (!gaveBirthEarly) {
                    c.pregnancyTimer--;
                    if (c.pregnancyTimer <= 0) {
                        this.giveBirth(c);
                    }
                }
            }
        });

        if (this.postBattleBirths.length > 0) {
            const newborns = this.postBattleBirths.map(b => b.newborn);
            if ((this.partners.length + newborns.length) > this.partnerCapacity) {
                this.logMessage('tribe', `有 ${newborns.length} 個新生命誕生了，但寢室已滿！您需要做出選擇...`, 'warning');
                this.pendingDecisions.push({
                    type: 'partner',
                    list: [...this.partners, ...newborns],
                    limit: this.partnerCapacity,
                    context: { newborns: this.postBattleBirths }
                });
            } else {
                this.postBattleBirths.forEach(birth => {
                    this.partners.push(birth.newborn);
                    this.player.skillPoints++;
                    this.logMessage('tribe', `${birth.mother.name} 誕下了一個新的哥布林夥伴：${birth.newborn.name}！你獲得了 1 點技能點。`, 'success');
                    if (this.tutorial.active && !this.tutorial.finishedPartyMgmt) {
                        this.triggerTutorial('firstBirth');
                    }
                });
            }
            this.postBattleBirths = [];
        }

        const milkProduced = this.mothers.filter(m => !m.isPregnant).reduce((total, mother) => {
            return total + Math.floor((mother.stats.charisma || 0) * 1);
        }, 0);
        if (milkProduced > 0) {
            this.resources.food += milkProduced;
            this.logMessage('tribe', `產房的孕母們生產了 ${milkProduced} 單位食物。`, 'success');
        }

        this.resources.food -= this.dailyFoodConsumption;
        if (this.resources.food < 0) {
            if (!this.isStarving) {
                this.logMessage('tribe', `食物不足！部落成員陷入飢餓狀態，所有能力下降25%！`, 'enemy');
                this.isStarving = true;
            }
            this.resources.food = 0;
        } else {
            if (this.isStarving) {
                this.logMessage('tribe', `食物充足，飢餓狀態解除了。`, 'success');
                this.isStarving = false;
            }
        }

        this.player.updateHp(this.isStarving);
        this.partners.forEach(p => {
            p.maxHp = p.calculateMaxHp(this.isStarving);
            p.currentHp = Math.min(p.currentHp, p.maxHp);
        });

        this.calculateDispatchYields();
        this.breedingChargesLeft = this.totalBreedingCharges;
    },
    nextDay() {
        // --- 事件偵測階段 ---
        let pendingRevengeInfo = null;
        const captivesByDifficulty = {};
        this.captives.forEach(c => {
            if (c.profession === '使徒' || c.profession === '女神') {
                return; // 跳過特殊俘虜，不計入復仇計算
            }
            if (c.originDifficulty) {
                if (!captivesByDifficulty[c.originDifficulty]) {
                    captivesByDifficulty[c.originDifficulty] = 0;
                }
                captivesByDifficulty[c.originDifficulty]++;
            }
        });

        for (const difficulty in captivesByDifficulty) {
            if (pendingRevengeInfo) break;
            const count = captivesByDifficulty[difficulty];
            const coefficient = REVENGE_DIFFICULTY_COEFFICIENT[difficulty] || 0;
            
            // 加入哨塔的減免計算
            let triggerChance = count * coefficient;
            
            const watchtowerLevel = this.buildings.watchtower.level;
            if (watchtowerLevel > 0) {
                const stationedCount = this.dispatch.watchtower.length;
                // 效果陣列，索引 0 代表 0 級，索引 1 代表 1 級...
                const reductionPerPartner = [0, 2, 4, 6, 8, 10][watchtowerLevel];
                const totalReduction = stationedCount * reductionPerPartner;

                if (totalReduction > 0) {
                    this.logMessage('tribe', `哨塔的守衛使復仇機率降低了 ${totalReduction}%。`, 'info');
                }
                
                triggerChance -= totalReduction;
            }
            
            // 確保機率不會變成負數
            triggerChance = Math.max(0, triggerChance);

            if (rollPercentage(triggerChance)) {
                pendingRevengeInfo = { difficulty: difficulty };
            }
        }

        // --- 流程控制 ---
        if (pendingRevengeInfo) {
            // 如果偵測到復仇事件，顯示提示框，今天的結算將在戰鬥結束後進行
            const difficulty = pendingRevengeInfo.difficulty;
            const nameConfig = CITY_NAMES[difficulty];
            const locationName = nameConfig.prefixes[randomInt(0, nameConfig.prefixes.length - 1)] + nameConfig.suffix;

            this.logMessage('tribe', `你從 ${locationName} 掠來的俘虜引來了追兵...`, 'enemy');

            this.showCustomAlert(
                `警報！一支來自「${locationName}」的復仇小隊襲擊了你的部落！`,
                () => {
                    this.triggerRevengeSquadBattle(difficulty, []);
                }
            );
            // 注意：這裡直接 return，不執行 processDailyUpkeep
        } else {
            // 如果沒有任何突發事件，直接執行正常的每日結算
            this.processDailyUpkeep();
            // 在每日結算後，立即檢查是否有待辦事項
            this.checkAndProcessDecisions();
        }
    },

    saveGame() {
        const saveData = {
            player: this.player,
            warehouseInventory: this.warehouseInventory, // 儲存倉庫物品
            partners: this.partners,
            captives: this.captives,
            resources: this.resources,
            buildings: this.buildings,
            day: this.day,
            dispatch: this.dispatch, 
            narrativeMemory: this.narrativeMemory,
            tutorial: this.tutorial,
            breedingChargesLeft: this.breedingChargesLeft,
            merchant: this.merchant,// 儲存更完整的商人資訊
            tempStatIncreases: this.tempStatIncreases,//能力點
            dlc: this.dlc,
            totalBreedingCount: this.totalBreedingCount,
            flags: this.flags,
        };
        localStorage.setItem('goblinKingSaveFile', JSON.stringify(saveData));
        this.showCustomAlert('遊戲進度已儲存！');
        this.hasSaveFile = true;
    },
    loadGame() {
        this.logs = { tribe: [], raid: [], combat: [] };
        const savedData = localStorage.getItem('goblinKingSaveFile');
        if (!savedData) {
            this.showCustomAlert('找不到存檔文件！');
            return;
        }

        try {
            this.isNewGame = false;
            const parsedData = JSON.parse(savedData);

            if (!parsedData.player) throw new Error("存檔中缺少玩家資料！");

            // 建立一個強大的「重塑」函式
            const rehydrateUnit = (unitData, UnitClass) => {
                if (!unitData) return null;
                let newUnit;

                // 針對騎士團單位，使用不同的建構函式參數
                if (UnitClass === KnightOrderUnit || UnitClass === FemaleKnightOrderUnit) {
                    // 讀檔時，我們已有完整的 stats，不需要 totalStatPoints 來重新計算。
                    // 因此傳入職業(unitType) 和 0 (作為 totalStatPoints 的佔位符) 來安全地建立物件。
                    newUnit = new UnitClass(unitData.profession, 0);
                } else {
                    // 其他單位維持原樣
                    newUnit = new UnitClass(unitData.name, unitData.stats || {});
                }
                
                // 2. 將存檔中的屬性安全地複製到新實例上 (這會用存檔中的正確數值覆蓋掉上面建立時的臨時數值)
                for (const key in unitData) {
                    if (Object.prototype.hasOwnProperty.call(unitData, key)) {
                        // 確保我們不會用存檔中的舊資料覆蓋掉 Class 的新方法
                        if (typeof newUnit[key] !== 'function') {
                            if (key === 'equipment' && unitData.equipment) {
                                for (const slot in unitData.equipment) {
                                    newUnit.equipment[slot] = rehydrateEquipment(unitData.equipment[slot]);
                                }
                            } else if (key === 'inventory' && Array.isArray(unitData.inventory)) {
                                newUnit.inventory = unitData.inventory.map(itemData => rehydrateEquipment(itemData));
                            } else {
                                newUnit[key] = unitData[key];
                            }
                        }
                    }
                }
                // 確保舊存檔的俘虜也有 breedingCount 屬性
                if (UnitClass === FemaleHuman || UnitClass === FemaleKnightOrderUnit) {
                    newUnit.breedingCount = unitData.breedingCount || 0;
                }
                return newUnit;
            };
            
            const rehydrateEquipment = (itemData) => {
                if (!itemData) return null;
                const newItem = new Equipment(itemData.baseName, itemData.type, itemData.slot, itemData.material, itemData.quality, itemData.specialAffix);
                Object.assign(newItem, itemData);
                return newItem;
            };

            // --- 使用新的「重塑」函式來讀取所有單位 ---
            this.warehouseInventory = (parsedData.warehouseInventory || []).map(itemData => rehydrateEquipment(itemData));
            
            // 為所有夥伴重塑 Goblin 物件
            this.partners = (parsedData.partners || []).map(pData => rehydrateUnit(pData, Goblin));

            // 為所有俘虜重塑對應的 Human 物件
            this.captives = (parsedData.captives || []).map(cData => {
                if (Object.keys(KNIGHT_ORDER_UNITS).includes(cData.profession)) {
                    return rehydrateUnit(cData, FemaleKnightOrderUnit);
                } else if (cData.visual) { // 判斷是否為女性
                    return rehydrateUnit(cData, FemaleHuman);
                } else {
                    return rehydrateUnit(cData, MaleHuman);
                }
            });

            // 為玩家重塑 Player 物件
            this.player = rehydrateUnit(parsedData.player, Player);

            // 為了舊存檔的相容性，如果讀取的玩家資料沒有 redeemedCodes 屬性，就幫他加上
            if (!this.player.redeemedCodes) {
                this.player.redeemedCodes = [];
            }
            // --- 後續的讀檔邏輯維持不變 ---
            const partnersMap = new Map(this.partners.map(p => [p.id, p]));
            this.player.party = (parsedData.player.party || [])
                .map(pData => partnersMap.get(pData.id))
                .filter(Boolean);

            this.resources = parsedData.resources;

            const defaultBuildings = {
                dungeon: { level: 0, name: "地牢" }, warehouse: { level: 0, name: "倉庫" },
                barracks: { level: 0, name: "寢室" }, armory: { level: 0, name: "兵工廠" },
                maternity: { level: 0, name: "產房" }, trainingGround: { level: 0, name: "訓練場" }, 
                merchantCamp: { level: 0, name: "商人營地" },
                watchtower: { level: 0, name: "哨塔" },
            };
            this.buildings = { ...defaultBuildings, ...parsedData.buildings };
            
            this.day = parsedData.day;
            this.totalBreedingCount = parsedData.totalBreedingCount || 0;
            this.flags = parsedData.flags || { defeatedApostle: false, defeatedGoddess: false };
            this.year = Math.floor((this.day - 1) / 360) ;
            this.month = Math.floor(((this.day - 1) % 360) / 30) + 1;
            this.currentDate = ((this.day - 1) % 30) + 1;

            const defaultDispatch = { hunting: [], logging: [], mining: [], watchtower: [] };
            this.dispatch = { ...defaultDispatch, ...parsedData.dispatch };
            
            this.narrativeMemory = parsedData.narrativeMemory;

            if (parsedData.dlc) {
                this.dlc = parsedData.dlc;
            } else {
                this.dlc = { hells_knights: false };
            }

            this.tutorial = { ...{ active: false, step: 0, merchantMet: false }, ...parsedData.tutorial };
            this.breedingChargesLeft = parsedData.breedingChargesLeft;
            this.merchant = { ...this.merchant, ...parsedData.merchant };

            this.salvageSaveData(); // 這是原本就有的ID修復函式

            this._patchMissingArmorStats(this); // +++ 新增這一行，用來修補舊鎧甲 +++

            this.player.updateHp(this.isStarving);
            this.partners.forEach(p => p.updateHp(this.isStarving));

            this.cleanupDispatchLists(); // 在讀取完所有資料後，清理一次派遣列表

            if (parsedData.tempStatIncreases) {
                this.tempStatIncreases = parsedData.tempStatIncreases;
            } else {
                this.cancelAttributePoints();
            }

            this.screen = 'tribe';
            this.showCustomAlert('遊戲進度已讀取！');

        } catch (e) {
            console.error("讀取存檔失敗:", e);
            this.showCustomAlert(`讀取存檔失敗！檔案可能已損毀。錯誤訊息: ${e.message}`);
        }
    },
    importGame() {// 匯入存檔方法
        if (!this.importSaveData) {
            this.showCustomAlert('請先貼上有效的存檔代碼！');
            return;
        }

        try {
            // 嘗試解析玩家貼上的 JSON 字串
            const parsedData = JSON.parse(this.importSaveData);

            // 檢查存檔資料的有效性，確保它是遊戲的存檔格式
            if (parsedData && parsedData.player && parsedData.day) {
                // 將解析後的資料存回 Local Storage
                localStorage.setItem('goblinKingSaveFile', this.importSaveData);
                this.showCustomAlert('存檔匯入成功！遊戲將自動重新載入...');

                // 清空輸入框並重新載入遊戲，以應用新存檔
                this.importSaveData = '';
                setTimeout(() => {
                    window.location.reload(); // 重新載入頁面
                }, 1500);

            } else {
                // 如果解析失敗或資料格式不對，給予提示
                this.showCustomAlert('無效的存檔代碼，請檢查格式是否正確！');
            }
        } catch (e) {
            // 如果 JSON.parse 出錯，說明格式有問題
            console.error('匯入存檔失敗:', e);
            this.showCustomAlert('存檔代碼格式錯誤！請確認是完整的 JSON 字串。');
        }
    },
    exportGame() {
        const saveData = localStorage.getItem('goblinKingSaveFile');
        if (!saveData) {
            this.showCustomAlert('沒有找到存檔，請先儲存遊戲。');
            return;
        }

        //不再直接嘗試複製，而是打開新的 modal
        this.modals.exportSave.data = saveData;
        this.modals.exportSave.isOpen = true;
        
        // 使用 nextTick 確保 textarea 渲染完成後再選取內容
        this.$nextTick(() => {
            this.$refs.export_save_data.select();
        });
    },
    copySaveToClipboard() {
        // 這個函式由新 modal 中的按鈕觸發
        const saveData = this.modals.exportSave.data;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(saveData)
                .then(() => {
                    this.showCustomAlert('已成功複製到剪貼簿！');
                })
                .catch(err => {
                    this.showCustomAlert('自動複製失敗，請手動複製文字框中的內容。');
                });
        } else {
            // 如果瀏覽器環境不支援，直接提示手動複製
            this.showCustomAlert('你的瀏覽器不支援自動複製，請手動複製文字框中的內容。');
        }
    },
    checkForSaveFile() {
        if (localStorage.getItem('goblinKingSaveFile')) {
            this.hasSaveFile = true;
        }
    },
    _patchMissingArmorStats(data) {
        if (!data || typeof data !== 'object') return;

        if (Array.isArray(data)) {
            data.forEach(item => this._patchMissingArmorStats(item));
        } else {
            // 判斷是否為一個「胸甲」物件且缺少有效的 allStats
            if (data.slot === 'chest' && data.stats && !data.stats.allStats) {
                const tier = data.material?.tier;
                const statsTable = {
                    '鎧甲': PLATE_ARMOR_STATS,
                    '皮甲': LEATHER_ARMOR_STATS,
                    '布服': CLOTH_ARMOR_STATS
                }[data.baseName];

                if (tier && statsTable && statsTable[tier]) {
                    data.stats.allStats = statsTable[tier].allStats;
                    console.log(`修補了舊裝備 ${data.name} 的 allStats 屬性。`);
                }
            }

            // 遞迴檢查物件的其他屬性
            for (const key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    this._patchMissingArmorStats(data[key]);
                }
            }
        }
    },
    salvageSaveData() {// 存檔拯救函式，用於修復汙染的舊存檔，增加強制ID清洗功能
        
        const processedItems = new Set(); // 用於追蹤已處理過的物品，避免重複操作
        let itemsSanitized = 0;

        // 建立一個函式，遞迴地處理所有可能包含物品的地方
        const sanitizeAndRegenerateIds = (data) => {
            // 如果是物品物件 (有 id 和 baseName)
            if (data && data.id && data.baseName) {
                // 如果這個物品物件的參照我們已經處理過了，就跳過
                if (processedItems.has(data)) {
                    return data;
                }
                // 為該物品生成一個全新的 ID
                data.id = crypto.randomUUID();
                processedItems.add(data); // 標記為已處理
                itemsSanitized++;
                return data;
            }
            // 如果是陣列，就遞迴處理陣列中的每個元素
            if (Array.isArray(data)) {
                return data.map(item => sanitizeAndRegenerateIds(item));
            }
            // 如果是物件，就遞迴處理物件的每個屬性值
            if (typeof data === 'object' && data !== null) {
                Object.keys(data).forEach(key => {
                    data[key] = sanitizeAndRegenerateIds(data[key]);
                });
                return data;
            }
            // 如果是基本類型，直接返回
            return data;
        };

        // 從遊戲資料的根層級開始，對所有物品進行 ID 清洗
        this.warehouseInventory = sanitizeAndRegenerateIds(this.warehouseInventory);
        this.player = sanitizeAndRegenerateIds(this.player);
        this.partners = sanitizeAndRegenerateIds(this.partners);

        console.log(`ID Sanitation complete: Regenerated IDs for ${itemsSanitized} item instances.`);
        if (itemsSanitized > 0) {
            this.logMessage('tribe', `系統偵測到並修復了 ${itemsSanitized} 個存檔中的物品ID衝突。`, 'system');
        }
    },
    processNextDecision() {
        if (this.pendingDecisions.length === 0) return;

        const decision = this.pendingDecisions.shift();

        if (decision.type === 'partner') {
            // 如果是夥伴寢室已滿的決策，呼叫新的夥伴管理視窗
            this.openPartnerManagementModal(decision.list, decision.limit, decision.context);
        } 
        else if (decision.type === 'apostle_battle') {
            this.triggerApostleBattle();
        } 
        else if (decision.type === 'goddess_battle') {
            this.triggerGoddessBattle();
        } 
        else if (decision.type === 'crone_dialogue') {
            this.triggerCroneDialogue();
        }
        else {
            // 否則，維持舊的邏輯，呼叫統一俘虜管理視窗
            this.openCaptiveManagementModal(
                decision.type,
                decision.list,
                decision.limit,
                decision.dungeonLimit,
                decision.context
            );
        }
    },
    checkAndProcessDecisions() {
        // 檢查是否在部落畫面，且是否有待辦事項
        if (this.screen === 'tribe' && this.pendingDecisions.length > 0) {
            // 延遲執行以確保畫面穩定
            setTimeout(() => this.processNextDecision(), 100);
        }
    },
    logMessage(panelKey, message, type = 'system') {
        const logArray = this.logs[panelKey];
        if (logArray) {
            const logEntry = { id: crypto.randomUUID(), message, type };
            
            if (panelKey === 'combat') {
                logEntry.turn = this.combat.turn;
            }
            
            logArray.push(logEntry);
            
            if (logArray.length > 100) {
                logArray.shift();
            }
        }
    },
    submitApiKey() {
        if (this.userApiKey && this.userApiKey.trim() !== '') {
            localStorage.setItem('goblinKingApiKey', this.userApiKey);
            this.showCustomAlert('API 金鑰已儲存！');
        }
        this.proceedToGame();
    },
    loadApiKey() {
        const savedKey = localStorage.getItem('goblinKingApiKey');
        if (savedKey) {
            this.userApiKey = savedKey;
        }
    },
    proceedToGame() {
        // 確保畫面永遠先進入序幕
        this.screen = 'intro';
    },
    checkForEvents() {
        const todayEvent = FESTIVALS.find(f => f.month === this.month && f.date === this.currentDate);
        if (todayEvent) {
            this.logMessage('tribe', `今天是特別的日子：${todayEvent.eventName}！`, 'system');
            if (todayEvent.type === 'valentine') {
                this.triggerValentineEvent(todayEvent);
            }
            // 未來可以在此處加入 else if 來處理其他類型的事件
        }
    },
    triggerValentineEvent(eventData) {
        if (this.merchant.isPresent) return;

        this.merchant.isPresent = true;
        this.merchant.stayDuration = 1; 
        this.merchant.avatar = eventData.avatar; 
        this.merchant.dialogue = eventData.dialogue; 

        this.generateMerchantGoods(true); 

        // --- 改用 narrative modal ---
        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = eventData.eventName; // 彈窗標題設為節日名稱
        modal.type = "tutorial";           // 重用教學的版面配置 (左邊頭像，右邊文字)
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = eventData.avatar; // 傳入該節日的特殊頭像路徑
        modal.content = `<p class="text-lg leading-relaxed">${eventData.dialogue}</p>`; // 放入對話內容

        this.logMessage('tribe', `旅行商人「世紀」因為${eventData.eventName}特別前來拜訪！`, 'success');
    },
    generateMerchantGoods(isValentine = false) {
        const level = this.buildings.merchantCamp.level;
        const itemCounts = [2, 4, 6, 8, 10];
        const numItems = itemCounts[level] || 2;
        let goods = [];
        const materialTiers = { 0: [1, 2], 1: [1, 3], 2: [2, 4], 3: [3, 5], 4: [4, 6] };
        const possibleTiers = materialTiers[level];

        for (let i = 0; i < numItems; i++) {
            // 步驟 1: 決定品質 (邏輯不變)
            const qualityRoll = randomInt(1, 100);
            let qualityKey = 'worn';
            if (qualityRoll <= 5) qualityKey = 'legendary';
            else if (qualityRoll <= 15) qualityKey = 'epic';
            else if (qualityRoll <= 32) qualityKey = 'rare';
            else if (qualityRoll <= 58) qualityKey = 'uncommon';
            else if (qualityRoll <= 93) qualityKey = 'common';

            // 步驟 2: 決定階級
            const tier = randomInt(possibleTiers[0], possibleTiers[1]);

            // 步驟 3: 隨機決定要生成哪一種裝備類型 (例如 "鎧甲", "皮甲", "弓")
            const randomItemType = this.craftableTypes[randomInt(0, this.craftableTypes.length - 1)];
            const baseName = randomItemType.baseName;
            const category = randomItemType.materialCategory;
            
            // 步驟 4: 根據階級和類型，鎖定唯一的材質
            const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => {
                const mat = EQUIPMENT_MATERIALS[key];
                return mat.tier === tier && mat.category === category;
            });
            
            // 如果找不到對應材質(例如該階級沒有這種材質的裝備)，則跳過本次生成
            if (!materialKey) {
                console.warn(`找不到階級為 ${tier} 且分類為 ${category} 的材質來製作 ${baseName}，跳過生成。`);
                continue; 
            }

            // 步驟 5: 創建物品
            const newItem = this.createEquipment(materialKey, qualityKey, baseName);
            goods.push(newItem);
        }

        // --- 情人節的特殊邏輯---
        if (isValentine && goods.length > 0) {
            const freeItemIndex = randomInt(0, goods.length - 1);
            goods[freeItemIndex].isFree = true;
            goods[freeItemIndex].name = `[免費] ${goods[freeItemIndex].name}`;
        }

        this.merchant.goods = goods;
    },
    calculateCaptiveValue(captive) {
        if (!captive) return 0;
        const hp = captive.calculateMaxHp();
        // 根據GDD: 俘虜價值 = 該俘虜當前總生命值 × 1.5
        return Math.floor(hp * 1.5);
    },
    performAbilityContest(partyA, partyB) {
        const partyA_Stats = this.getPartyAverageStats(partyA);
        const partyA_DiceCount = Math.max(1, Math.floor(partyA_Stats.average / 20));
        const partyA_RollResult = rollDice(`${partyA_DiceCount}d20`);
        let partyA_Value = partyA_RollResult.total + partyA.length;

        const partyB_Stats = this.getPartyAverageStats(partyB);
        const partyB_DiceCount = Math.max(1, Math.floor(partyB_Stats.average / 20));
        const partyB_RollResult = rollDice(`${partyB_DiceCount}d20`);
        const partyB_Value = partyB_RollResult.total + partyB.length;

        let penalty = (partyA.length - partyB.length) * 2;// --- 應用「散開脫逃」技能效果 ---
        if (penalty > 0) { // 只有當我方人數較多，可能產生懲罰時才計算
            const skillId = 'raid_dispersed_escape';
            if (this.player && this.player.learnedSkills[skillId]) {
                const skillLevel = this.player.learnedSkills[skillId];
                const skillData = SKILL_TREES.raiding.find(s => s.id === skillId);
                const reduction = skillData.levels[skillLevel - 1].effect.penalty_reduction;
                const mitigatedPenalty = penalty * (1 - reduction);
                const bonus = penalty - mitigatedPenalty; // 將被減免的懲罰值，轉化為對我方的加值
                partyA_Value += bonus;
            }
        }

        return {
            partyA_Value,
            partyB_Value,
            // 讓 sides 的值直接來自擲骰結果，不再寫死
            partyA_Details: { rolls: partyA_RollResult.rolls, partySize: partyA.length, sides: partyA_RollResult.sides },
            partyB_Details: { rolls: partyB_RollResult.rolls, partySize: partyB.length, sides: partyB_RollResult.sides }
        };
    },

    //---其他---
    formatBonus(bonus) {
        const bonusValue = Math.round(bonus); // 四捨五入取整
        if (bonusValue > 0) {
            return ` (+${bonusValue})`;
        }
        if (bonusValue < 0) {
            return ` (${bonusValue})`; // 負數自帶 '-' 號
        }
        return ''; // 如果是 0，則不顯示
    },

    bailoutOfferedButRefused: false, // 記錄玩家是否拒絕過求助

    merchantDialogueTimeout: null,
    
    triggerTutorial(eventName) {
        if (!this.tutorial.active) return;

        //    如果玩家不在部落，則將教學事件暫存起來
        if (this.screen !== 'tribe') {
            this.tutorial.pendingTutorial = eventName;
            return; // 暫不執行，等待玩家返回部落
        }

        // 如果玩家在部落，則正常執行教學
        switch (eventName) {
            case 'firstAttributePoint':
                if (!this.tutorial.finishedAttributePoints) {
                    this.showCustomAlert('王，您因繁衍而變得更強，獲得了「能力點」！請在您的狀態欄中，點擊能力值旁邊發光的「+」按鈕來分配它，提升您的實力。');
                    this.tutorial.finishedAttributePoints = true;
                }
                break;
            case 'firstBirth':
                if (!this.tutorial.finishedPartyMgmt) {
                    this.showCustomAlert('恭喜！您的第一個孩子誕生了。請前往「部落建設」->「寢室」->「管理夥伴」，將他加入您的出擊隊伍，他將為您提供戰力加成！');
                    this.tutorial.finishedPartyMgmt = true;
                }
                break;
            case 'firstLoot':
                if (!this.tutorial.finishedEquipping) {
                    this.showCustomAlert('您獲得了第一件裝備！它被存放在「部落建設」->「倉庫」->「玩家背包」中。您可以將它裝備在自己或夥伴身上以增強戰力。');
                    this.tutorial.finishedEquipping = true;
                }
                break;
            case 'armoryBuilt':
                if (!this.tutorial.finishedDecomposing) {
                    this.showCustomAlert('兵工廠已建成！現在您可以將多餘或老舊的裝備「分解」成資源了。這在「倉庫」管理介面中進行操作。');
                    this.tutorial.finishedDecomposing = true;
                }
                break;
        }
        // 觸發後清除暫存
        this.tutorial.pendingTutorial = null;
    },
    
    isGeneratingAvatar: false,

    handleMapClick(target, event) {
        if (this.isCombatLocked) {
            this.showCustomAlert('你被巡邏隊攔截了，必須先擊敗他們！');
            return;
        }
        event.stopPropagation();

        // The key change: just set the selectedTarget and move the icon.
        this.selectedTarget = target;

        this.$nextTick(() => {
            if (!this.selectedTarget) return;

            let anchorX, anchorY;
            if (Array.isArray(this.selectedTarget)) {
                anchorX = this.selectedTarget[0].x - 10;
                anchorY = this.selectedTarget[0].y + 10;
            } else {
                anchorX = this.selectedTarget.x + (this.selectedTarget.width / 2) - 10;
                anchorY = this.selectedTarget.y + this.selectedTarget.height;
            }
            this.playerMapPosition.x = anchorX;
            this.playerMapPosition.y = anchorY;
            
            // Removed the call to scoutTarget() here.
        });
    },
    
    closeScoutModalAndClearTarget() {
        this.modals.scoutInfo.isOpen = false;
        this.selectedTarget = null;
    },

    startCombatFromScout(enemyGroup) {
        if (enemyGroup && enemyGroup.length > 0) {
            this.startCombat(enemyGroup);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    startCombatFromModal() {
        if (this.selectedTarget && !Array.isArray(this.selectedTarget) && this.selectedTarget.occupants) {
            this.startCombat(this.selectedTarget.occupants);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    lootBuildingFromModal() {
        if (this.selectedTarget && !Array.isArray(this.selectedTarget)) {
            this.lootBuilding(this.selectedTarget);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    breedingChargesLeft: 0,
    
    combat: { 
        allies: [], 
        enemies: [], 
        turn: 0, 
        log: [], 
        isProcessing: false, 
        currentEnemyGroup: [], 
        playerActionTaken: false, 
        isReinforcementBattle: false,
        isUnescapable: false ,
        isGoddessQnA: false, // 標記當前是否為女神問答階段
        goddessQuestion: '',  // 當前顯示的問題
        playerAnswer: ''      // 玩家的輸入
    },
    
    startTutorial(choice) {
    this.tutorial.active = choice;
    this.screen = 'tribe'; // 只切換畫面，初始化交給 x-init
    },
    advanceTutorial(step) {
        this.tutorial.step = step;
        switch(step) {
            //  步驟1: 僅作為一次性的裝備提示，確認後直接推進到步驟2
            case 1:
                this.showCustomAlert(
                    '你在部落中發現了一些基礎裝備！你可以隨時在「部落建設」->「倉庫」->「玩家背包」中找到並穿上它們。',
                    () => { this.advanceTutorial(2); } // 點擊確認後，立即執行下一步教學
                );
                break;
            //  步驟2: 引導點擊「部落建設」
            case 2:
                this.showCustomAlert('一個強大的部落需要穩固的根基。讓我們點擊發光的『部落建設』按鈕，來規劃您的部落。');
                break;
            //  步驟3: 引導建造「地牢」
            case 3:
                this.modals.construction.isOpen = true;
                this.modals.construction.activeTab = 'dungeon';
                this.modals.dungeon.subTab = 'upgrade';
                this.showCustomAlert('做得好！現在請點擊發光的『升級』分頁，並為您的部落打下第一個根基。');
                break;
            //  步驟4: 引導建造「產房」
            case 4:
                this.modals.construction.activeTab = 'maternity';
                this.modals.maternity.subTab = 'upgrade';
                break;
            //  步驟5: 引導「出擊掠奪」
            case 5:
                this.modals.construction.isOpen = false;
                setTimeout(() => {
                    this.showCustomAlert('太棒了！所有基礎設施都已就緒。關閉此視窗，點擊發光的『出擊掠奪』為部落帶來第一批女性吧！');
                }, 100);
                break;
            // ... 後續步驟 5.5, 6, 7 維持不變 ...
            case 5.5: 
                this.showCustomAlert('王，知己知彼，百戰不殆。在未知的土地上，首先使用『偵查環境』來探查周遭的危險與機遇吧。');
                break;
            case 6:
                this.showCustomAlert('恭喜王！您帶回了部落的第一批戰利品。現在，再次進入「部落建設」，找到「地牢」中的「繁衍後代」功能。您可以根據剩餘次數，選擇一位或多位對象，為您的部落產下更強大的哥布林戰士吧！');
                break;
            case 7:
                const modal = this.modals.narrative;
                modal.isOpen = true;
                modal.title = "與神秘商人的相遇";
                modal.type = "tutorial"; 
                modal.isLoading = false;
                modal.isAwaitingConfirmation = false;
                modal.content = `
                    <p>呵呵...哥布林王...我有很多好東西...。</p>
                    <p>叫我『世紀』就好，一個四處遊蕩，尋找『有趣』事物的旅行商人，絕對不是什麼可疑的人，嘿...。</p>
                    <br>
                    <p>把那些抓來的妹子...嘿嘿...給ㄨㄛ...咳!我是說交易，會給你一些收藏的寶貝作為回報。</p>
                    <br>
                    <p><b>左邊是我的商品，右邊是你的『貨幣』(你懂的...)。選好商品，再湊齊足夠素質的俘虜，就能完成交易了。</b></p>
                    <br>
                    <p>很簡單吧？我很期待...嘿嘿嘿...(口水)</p>
                `;
                break;
        }
    },

    releaseCarriedCaptive(captiveId) {
        if (!this.currentRaid) return;

        const captiveIndex = this.currentRaid.carriedCaptives.findIndex(c => c.id === captiveId);
        
        if (captiveIndex > -1) {
            // 先取得俘虜的名字，用於日誌記錄
            const captiveName = this.currentRaid.carriedCaptives[captiveIndex].name;
            
            // 從列表中移除該俘虜
            this.currentRaid.carriedCaptives.splice(captiveIndex, 1);
            
            // 在掠奪日誌中記錄此事件
            this.logMessage('raid', `你釋放了俘虜 ${captiveName}。`, 'info');
        }
    },

    finalizeReleasePartner(partner) {
        // 這個函式現在已經不再被直接使用，但為安全起見，也將其邏輯指向新的函式
        this.removePartner(partner.id);
    },

    executeItemManagementAction(action, itemId) {
        const modal = this.modals.itemManagement;
        const itemIndex = modal.items.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        const [item] = modal.items.splice(itemIndex, 1);

        if (action === 'decompose') {
            const material = item.material;
            const returnRate = [0.2, 0.3, 0.4, 0.5][this.buildings.armory.level - 1] || 0;
            const resourcesBack = Math.floor(material.cost * returnRate);

            if (material.type === 'metal') {
                this.resources.stone += resourcesBack;
                this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 礦石。`, 'info');
            } else {
                this.resources.wood += resourcesBack;
                this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 木材。`, 'info');
            }
        } else if (action === 'discard') {
            this.logMessage('tribe', `你丟棄了裝備 [${item.name}]。`, 'info');
        }
    },

    confirmItemManagement() {
        const modal = this.modals.itemManagement;
        if (modal.items.length > modal.capacity) {
            this.showCustomAlert('處理尚未完成！剩餘裝備數量仍大於可用空間。');
            return;
        }
        modal.items.forEach(item => {  // 將剩餘決定保留的裝備放入倉庫/背包
            if (this.warehouseInventory.length < this.warehouseCapacity) {
                this.warehouseInventory.push(item);
            } else {
                this.player.inventory.push(item);
            }
        });
        this.logMessage('tribe', `你處理完畢，並保留了 ${modal.items.length} 件裝備。`, 'success');
        if (typeof modal.onConfirm === 'function') {  // 執行回呼函式 (例如：完成夥伴的逐出)
            modal.onConfirm();
        }

        modal.isOpen = false;
        modal.onConfirm = null;
        modal.items = [];
    },

    gainResourcesFromEnemy(enemy) {
        // 如果不是在掠奪中 (例如部落防禦戰)，則不掉落資源，直接返回。
        if (!this.currentRaid) {
            return;
        }

        const dropConfig = {
            easy:   { res: [5, 10],  guard: [10, 15] },
            normal: { res: [10, 20], guard: [20, 30] },
            hard:   { res: [20, 40], guard: [40, 60] },
            hell:   { res: [40, 80], guard: [80, 120] },
        };
        const difficulty = this.currentRaid.difficulty;
        let foodDrop = 0, woodDrop = 0, stoneDrop = 0;

        if (enemy.profession.includes('居民')) {
            foodDrop = randomInt(dropConfig[difficulty].res[0], dropConfig[difficulty].res[1]);
            woodDrop = randomInt(dropConfig[difficulty].res[0], dropConfig[difficulty].res[1]);
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodDrop);
            this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodDrop);
            this.logMessage('raid', `你獲得了 食物x${foodDrop}, 木材x${woodDrop}。`, 'success');
        } else if (enemy.profession.includes('守軍')) {
            foodDrop = randomInt(dropConfig[difficulty].guard[0], dropConfig[difficulty].guard[1]);
            stoneDrop = randomInt(dropConfig[difficulty].guard[0], dropConfig[difficulty].guard[1]);
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodDrop);
            this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneDrop);
            this.logMessage('raid', `你獲得了 食物x${foodDrop}, 礦石x${stoneDrop}。`, 'success');
        }
    },

    _generateAndAwardLoot(config) {
        // 解構傳入的設定物件，並提供預設值以增加穩健性
        const {
            baseDropRate = 0,
            possibleQualities = ['common'],
            difficulty = 'easy',
            sourceName = 'an unknown source' // 用於日誌的來源名稱
        } = config;

        // 1. 計算最終掉落率並判定是否掉落
        const finalDropRate = baseDropRate * (1 + (this.player.getTotalStat('luck') / 100) * 0.5);
        if (!rollPercentage(finalDropRate)) {
            return; // 未觸發掉落，直接結束
        }

        // --- 以下是從原函式中提取的共通物品生成邏輯 ---
        // 2. 決定品質
        const qualityKey = possibleQualities[randomInt(0, possibleQualities.length - 1)];

        // 3. 根據難度決定材質階級範圍
        const materialTiers = {
            easy:   { metal: [1, 3], wood: [1, 3], leather: [1, 3], cloth: [1, 3] },
            normal: { metal: [2, 4], wood: [2, 4], leather: [2, 4], cloth: [2, 4] },
            hard:   { metal: [3, 5], wood: [3, 5], leather: [3, 5], cloth: [3, 5] },
            hell:   { metal: [4, 6], wood: [4, 6], leather: [4, 6], cloth: [4, 6] },
        };
        const possibleTiers = materialTiers[difficulty];

        // 4. 隨機決定要掉落的裝備「類型」
        const randomItemType = this.craftableTypes[randomInt(0, this.craftableTypes.length - 1)];
        const baseName = randomItemType.baseName;
        const category = randomItemType.materialCategory;

        // 5. 根據難度、類型，找到對應的唯一材質
        if (!possibleTiers || !possibleTiers[category]) {
            console.error(`在難度 ${difficulty} 中找不到材質分類 ${category} 的階級設定。`);
            return;
        }
        const tierRange = possibleTiers[category];
        const tier = randomInt(tierRange[0], tierRange[1]);
        
        const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => {
            const mat = EQUIPMENT_MATERIALS[key];
            return mat.tier === tier && mat.category === category;
        });

        if (!materialKey) {
            console.warn(`找不到階級為 ${tier} 且分類為 ${category} 的材質。`);
            return;
        }

        // 6. 創建物品
        const newItem = this.createEquipment(materialKey, qualityKey, baseName);

        // --- 以下是共通的物品授予邏輯 ---
        // 7. 檢查背包容量並授予物品
        if (this.player.inventory.length >= this.backpackCapacity) {
            const logPanel = this.currentRaid ? 'raid' : 'tribe';
            this.logMessage(logPanel, `背包已滿！你從 ${sourceName} 發現了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>，但需要先整理背包才能拾取。`, 'warning');
            
            this.modals.itemManagement = {
                isOpen: true,
                title: `戰利品管理 (背包已滿)`,
                message: `請處理裝備，直到數量符合背包上限 (${this.backpackCapacity})。`,
                items: [...this.player.inventory, newItem],
                capacity: this.backpackCapacity,
                onConfirm: () => {
                    this.player.inventory = [...this.modals.itemManagement.items];
                    this.logMessage(logPanel, `你整理完畢，繼續冒險。`, 'success');
                }
            };
            return;
        }
        
        // 8. 成功獲得物品
        this.player.inventory.push(newItem);
        if (this.tutorial.active && !this.tutorial.finishedEquipping) {
            this.triggerTutorial('firstLoot');
        }
        
        const logPanel = this.currentRaid ? 'raid' : 'tribe';
        this.logMessage(logPanel, `你從 ${sourceName} 獲得了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');
    },

    handleLootDrop(enemy) {
        const isKnight = Object.keys(KNIGHT_ORDER_UNITS).includes(enemy.profession);
        const baseDropRates = { '居民': 10, '女性居民': 10, '城市守軍': 30 };
        const baseDropRate = isKnight ? 50 : (baseDropRates[enemy.profession] || 0);
        
        if (baseDropRate === 0) return;

        // 決定掉落品質的範圍
        const qualityTiers = {
            '居民': ['worn', 'common'],
            '女性居民': ['worn', 'common'],
            '城市守軍': ['uncommon', 'rare'],
            'knight': ['epic', 'legendary']
        };
        const qualitySource = isKnight ? 'knight' : enemy.profession;
        const possibleQualities = qualityTiers[qualitySource] || ['worn'];

        // 決定難度
        let encounterDifficulty = 'easy';
        if (this.currentRaid) {
            encounterDifficulty = this.currentRaid.difficulty;
        } else if (enemy.originDifficulty) {
            encounterDifficulty = enemy.originDifficulty;
        }

        // 呼叫統一的戰利品生成函式
        this._generateAndAwardLoot({
            baseDropRate: baseDropRate,
            possibleQualities: possibleQualities,
            difficulty: encounterDifficulty,
            sourceName: enemy.name
        });
    },

    // 為敵人穿戴裝備的智慧助手函式
    equipEnemy(enemy, difficulty) {
        if (!enemy || !enemy.equipment) return;

        const isKnight = Object.keys(KNIGHT_ORDER_UNITS).includes(enemy.profession);

        // I. 騎士團 (Knight Order) 的專屬裝備邏輯
        if (isKnight) {
            const qualityKey = 'epic'; // 騎士團固定穿史詩品質

            // 輔助函式：根據難度和可選的材質類型，獲取一個隨機材質
            const getRandomMaterialKey = (type = null) => {
                const materialTiers = {
                    easy:   { metal: [2, 3], wood: [2, 3] },
                    normal: { metal: [3, 4], wood: [3, 4] },
                    hard:   { metal: [4, 5], wood: [4, 5] },
                    hell:   { metal: [5, 6], wood: [5, 6] },
                };
                const possibleTiers = materialTiers[difficulty] || materialTiers['easy'];
                
                const materialType = type || (rollPercentage(50) ? 'metal' : 'wood');
                const tierRange = possibleTiers[materialType];
                const tier = randomInt(tierRange[0], tierRange[1]);
                
                return Object.keys(EQUIPMENT_MATERIALS).find(key => 
                    EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType
                );
            };

            // 輔助函式：建立一件指定裝備
            const createAndEquip = (slot, baseName, materialType = null) => {
                const materialKey = getRandomMaterialKey(materialType);
                if (!materialKey) return;
                const item = this.createEquipment(materialKey, qualityKey, baseName, null, true);
                enemy.equipment[slot] = item;
            };

            // 1. 所有騎士團成員必穿身體盔甲
            createAndEquip('chest', '鎧甲');

            // 2. 根據職業分配武器和副手
            switch (enemy.profession) {
                case '士兵':
                    createAndEquip('mainHand', '劍');
                    if (rollPercentage(50)) {
                        createAndEquip('offHand', '劍');
                    } else {
                        createAndEquip('offHand', '盾');
                    }
                    break;
                case '盾兵':
                    // 【修正】移除材質類型的強制指定
                    createAndEquip('offHand', '盾');
                    break;
                case '槍兵':
                    createAndEquip('mainHand', '長槍');
                    if (rollPercentage(50)) {
                        createAndEquip('offHand', '盾');
                    }
                    break;
                case '法師':
                    createAndEquip('mainHand', '法杖');
                    break;
                case '弓兵':
                    createAndEquip('mainHand', '弓');
                    break;
                case '祭司':
                    createAndEquip('mainHand', '法杖');
                    // 【修正】移除材質類型的強制指定
                    createAndEquip('offHand', '盾');
                    break;
                case '騎士':
                    if (rollPercentage(50)) {
                        createAndEquip('mainHand', '劍');
                    } else {
                        createAndEquip('mainHand', '長槍');
                    }
                    createAndEquip('offHand', '盾');
                    break;
                default:
                    createAndEquip('mainHand', '劍');
                    createAndEquip('offHand', '盾');
                    break;
            }

        // II. 守軍與居民 (Guard & Resident) 的裝備邏輯
        } else {
            let numPieces = 0;
            let qualityKey = 'worn';
            if (enemy.profession === '城市守軍') {
                numPieces = randomInt(1, 2);
                qualityKey = 'uncommon';
            } else if (enemy.profession.includes('居民')) {
                if (rollPercentage(50)) {
                    numPieces = 1;
                    qualityKey = 'worn';
                } else {
                    return;
                }
            } else {
                return;
            }
            const materialTiers = {
                easy: { metal: [1, 3], wood: [1, 3] },
                normal: { metal: [2, 4], wood: [2, 4] },
                hard: { metal: [3, 5], wood: [3, 5] },
                hell: { metal: [4, 6], wood: [4, 6] },
            };
            const possibleTiers = materialTiers[difficulty] || materialTiers['easy'];
            
            let possibleSlots = ['mainHand', 'chest', 'offHand'];
            for (let i = 0; i < numPieces; i++) {
                if (possibleSlots.length === 0) break;
                const slotIndex = randomInt(0, possibleSlots.length - 1);
                const slot = possibleSlots.splice(slotIndex, 1)[0];

                const possibleItemsForSlot = this.craftableTypes.filter(t => t.slot === slot);
                if (possibleItemsForSlot.length === 0) continue;
                const baseItem = possibleItemsForSlot[randomInt(0, possibleItemsForSlot.length - 1)];
                
                if (!baseItem) continue;

                const isMetal = rollPercentage(50);
                const tierRange = isMetal ? possibleTiers.metal : possibleTiers.wood;
                const tier = randomInt(tierRange[0], tierRange[1]);
                const materialType = isMetal ? 'metal' : 'wood';
                const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => 
                    EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType
                );
                if (!materialKey) continue;

                const newItem = this.createEquipment(materialKey, qualityKey, baseItem.baseName, null, true);
                enemy.equipment[slot] = newItem;
            }
        }

        // III. 最後更新敵人狀態 (通用)
        if (enemy.updateHp) {
            enemy.updateHp(this.isStarving);
        } else {
            enemy.maxHp = enemy.calculateMaxHp(this.isStarving);
            enemy.currentHp = enemy.maxHp;
        }
    },

    createEquipment(materialKey, qualityKey, baseName, specialAffix = null, forceNoAffix = false) {
        const material = EQUIPMENT_MATERIALS[materialKey];
        const quality = EQUIPMENT_QUALITIES[qualityKey];
        // 從新的 craftableTypes 中查找物品基礎資訊
        const baseItem = this.craftableTypes.find(t => t.baseName === baseName);
        
        // 建立一個基礎的 Equipment 物件
        const newItem = new Equipment(baseItem.baseName, baseItem.type, baseItem.slot, material, quality, specialAffix);
        
        // 將品質加成直接儲存在裝備物件上，供戰鬥時使用
        newItem.qualityBonus = quality.qualityBonus;

        // --- 根據類型和材質等級賦予基礎數值 ---
        const tier = material.tier;
        let baseStats = {};

        if (baseItem.type === 'weapon') {
            if (baseItem.baseName === '盾') {
                // 從 SHIELD_STATS 獲取盾牌數值
                baseStats = { 
                    blockTarget: SHIELD_STATS[tier].blockTarget,
                    attackBonus: SHIELD_STATS[tier].attackBonus
                };
            } else {
                // 從 WEAPON_STATS 獲取武器傷害
                baseStats = { damage: WEAPON_STATS[baseItem.baseName][tier] };
            }
        } else if (baseItem.type === 'armor') {
            // 根據 armorType 決定要查詢哪張表
            switch(baseItem.armorType) {
                case 'plate':
                    baseStats = {
                        attackBonus: PLATE_ARMOR_STATS[tier].attackBonus,
                        damageReduction: PLATE_ARMOR_STATS[tier].damageReduction,
                        allStats: PLATE_ARMOR_STATS[tier].allStats
                    };
                    break;
                case 'leather':
                    baseStats = {
                        damageReduction: LEATHER_ARMOR_STATS[tier].damageReduction,
                        allStats: LEATHER_ARMOR_STATS[tier].allStats
                    };
                    break;
                case 'cloth':
                    baseStats = {
                        damageReduction: CLOTH_ARMOR_STATS[tier].damageReduction,
                        allStats: CLOTH_ARMOR_STATS[tier].allStats
                    };
                    break;
            }
        }
        
        // 將查詢到的基礎數值賦予 newItem.stats
        newItem.stats = { ...baseStats };

        // --- 詞綴生成邏輯---
        if (!specialAffix && !forceNoAffix) {
            const affixCountRange = quality.affixes;
            const affixCount = randomInt(affixCountRange[0], affixCountRange[1]);
            
            let availableAffixes = Object.keys(STANDARD_AFFIXES);
            
            for (let i = 0; i < affixCount && availableAffixes.length > 0; i++) {
                const randomAffixKey = availableAffixes[randomInt(0, availableAffixes.length - 1)];
                const selectedAffix = { ...STANDARD_AFFIXES[randomAffixKey], key: randomAffixKey };
                
                newItem.affixes.push(selectedAffix);
                
                availableAffixes = availableAffixes.filter(key => {
                    if (key === randomAffixKey) return false;
                    if (selectedAffix.conflicts && selectedAffix.conflicts.includes(key)) return false;
                    const otherAffix = STANDARD_AFFIXES[key];
                    if (otherAffix.conflicts && otherAffix.conflicts.includes(randomAffixKey)) return false;
                    return true;
                });
            }
        }                  
        
        // 重新生成名稱並返回
        newItem.name = newItem.generateName();
        return newItem;
    },

    showInBattleDialogue(unit, dialogueKey) {
        const data = unit instanceof ApostleMaiden ? SPECIAL_BOSSES.apostle_maiden : SPECIAL_BOSSES.spiral_goddess_mother;
        if (!data || !data.dialogues[dialogueKey]) return;

        unit.triggeredDialogues.add(dialogueKey); // 標記此對話已觸發

        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = unit.name;
        modal.type = "tutorial";
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = data.avatar;
        modal.content = `<p class="text-lg leading-relaxed">${data.dialogues[dialogueKey]}</p>`;

        // 戰鬥中的對話不需要特殊回呼，關閉即可
        modal.onConfirm = () => {
            modal.isOpen = false;
        };
    },
    
    addCaptiveToCarry(newCaptives) {
        const captivesToAdd = Array.isArray(newCaptives) ? newCaptives : [newCaptives];
        const tempCarried = [...this.currentRaid.carriedCaptives, ...captivesToAdd];

        if (tempCarried.length > this.carryCapacity) {
            // 在呼叫時，將 this.carryCapacity 作為第三個參數傳遞進去
            this.openCaptiveManagementModal('raid', tempCarried, this.carryCapacity);
        } else {
            this.currentRaid.carriedCaptives = tempCarried;
            this.finishCombatCleanup();
        }
    },

    finishCombatCleanup(returnToTribe = false) {
        this.resetAllSkillCooldowns();

        if (this.currentRaid) {
            const defeatedEnemyIds = this.combat.enemies.filter(e => !e.isAlive()).map(e => e.id);
            defeatedEnemyIds.forEach(id => this.removeUnitFromRaidZone(id));
            this.updateBuildingScoutText();
        }

        this.combat.allies = [];
        this.combat.enemies = [];
        this.combat.turn = 0;
        this.combat.log = [];
        this.combat.isProcessing = false;
        this.combat.currentEnemyGroup = [];
        this.combat.playerActionTaken = false;
        this.combat.isReinforcementBattle = false;
        this.combat.isUnescapable = false;
        this.screen = returnToTribe ? 'tribe' : 'raid';
    },

    importSaveData: '', // 新增一個屬性來儲存匯入的文字

    assignToDispatch(partnerId, task) {
        // 直接呼叫權威的指派函式
        this.assignPartner(partnerId, task);
    },

    removeFromDispatch(partnerId, task) {
        this.dispatch[task] = this.dispatch[task].filter(id => id !== partnerId);
    },

    removeUnitFromRaidZone(unitId) {
        if (!this.currentRaid || !unitId) return;

        const zone = this.currentRaid.currentZone;

        // 1. 處理遊蕩的敵人 (二維陣列)
        zone.enemies = zone.enemies
            .map(group => group.filter(unit => unit.id !== unitId)) // 從每個小隊中移除該單位
            .filter(group => group.length > 0); // 移除因此變空的小隊

        // 2. 處理所有建築物內的敵人 (一維陣列)
        zone.buildings.forEach(building => {
            if (building.occupants && building.occupants.length > 0) {
                building.occupants = building.occupants.filter(unit => unit.id !== unitId);
            }
        });
        this.currentRaid.currentZone = { ...zone };
    }, 

    updateBuildingScoutText() {
        if (!this.currentRaid) return;
        this.currentRaid.currentZone.buildings.forEach(b => {
            // 只為已被詳細偵查過的建築產生狀態文字
            if (b.scoutState === 'scouted') {
                if (b.occupants.length === 0) {
                    b.postScoutText = b.looted ? ' (空)' : ' (可搜刮)';
                } else {
                    b.postScoutText = ` (${b.occupants.length}人)`;
                }
            } else {
                // 如果只是 revealed，則沒有後綴文字
                b.postScoutText = '';
            }
        });
        // 這一步是為了確保即使只是文字變動，畫面也能強制刷新
        this.currentRaid.currentZone = { ...this.currentRaid.currentZone };
    },
    
};