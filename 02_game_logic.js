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
        
        // 根據 GDD，計算最終的綜合平均值
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

    performAbilityContest(partyA, partyB) {
        const partyA_Stats = this.getPartyAverageStats(partyA);
        const partyA_DiceCount = Math.max(1, Math.floor(partyA_Stats.average / 20));
        const partyA_RollResult = rollDice(`${partyA_DiceCount}d20`);
        let partyA_Value = partyA_RollResult.total + partyA.length;

        const partyB_Stats = this.getPartyAverageStats(partyB);
        const partyB_DiceCount = Math.max(1, Math.floor(partyB_Stats.average / 20));
        const partyB_RollResult = rollDice(`${partyB_DiceCount}d20`);
        const partyB_Value = partyB_RollResult.total + partyB.length;

        // --- 應用「散開脫逃」技能效果 ---
        let penalty = (partyA.length - partyB.length) * 2;
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
    
    pendingDecisions: [],
    //派遣系統
    dispatch: {
        hunting: [], // 打獵隊伍
        logging: [], // 伐木隊伍
        mining: [],  // 採礦隊伍
        watchtower: [], // 哨塔派駐隊伍
    },

    // 判斷「商人營地」按鈕是否應該被禁用
    get isMerchantButtonDisabled() {
        return !this.merchant.isPresent;
    },

    // 判斷「出擊掠奪」按鈕是否應該發光
    get shouldRaidButtonGlow() {
        return this.tutorial.active && this.tutorial.step === 5;
    },

    // 判斷「部落建設」按鈕是否應該發光
    get shouldConstructionButtonGlow() {
        return this.tutorial.active && this.tutorial.step === 2;
    },

    dlc: {
        hells_knights: false // 「王國騎士團」DLC，預設為未解鎖
    },
    bailoutCounter: 0, // 用來計算玩家求助的次數
    totalBreedingCount: 0, // 用於追蹤觸發使徒BOSS戰的總繁衍次數
    flags: {
        defeatedApostle: false,
        defeatedGoddess: false
    },
    raidTimeExpired: false, // 用來標記時間是否在戰鬥中耗盡
    isRetreatingWhenTimeExpired: false, // 記錄時間耗盡時是否正在脫離
    bailoutOfferedButRefused: false, // 記錄玩家是否拒絕過求助
    screen: 'api_key_input', // 將初始畫面改為 API 輸入介面
    userApiKey: '',          // 用來儲存玩家輸入的金鑰
    musicSettings: {
        src: null,
        isPlaying: false,
        playOnScreen: 'tribe', // 預設在部落畫面播放
    },
    //用於重生畫面的資料物件
    rebirth: {
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
    //觸發重生的函式
    initiateRebirth() {
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

    //處理重生畫面點數分配的函式
    updateRebirthStat(stat, value) {
        const intValue = parseInt(value);
        if (!isNaN(intValue) && intValue >= 1) { // 確保點數至少為 1
            this.rebirth.stats[stat] = intValue;
        } else {
            this.rebirth.stats[stat] = 1; // 如果輸入無效，則重設為 1
        }
    },

    //確認重生設定的函式
    confirmRebirth() {
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

    executeQuickBreeding() {
        // --- 包含了所有繁衍的後台遊戲機制 ---
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        for (const id of selectedIds) {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                this.totalBreedingCount++; // 每繁衍一位，計數就 +1
                // Boss 觸發邏輯
                this.totalBreedingCount++;
                if (this.totalBreedingCount === 69) {
                    this.pendingDecisions.push({ type: 'apostle_battle' }); 
                    break; 
                }
                if (this.flags.defeatedApostle && this.totalBreedingCount === 88) {
                    this.pendingDecisions.push({ type: 'goddess_battle' }); 
                    break;
                }
            }
        }

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性快速進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        
        // 重置並關閉視窗
        this.modals.dungeon.selectedBreedIds = [];
        this.modals.construction.isOpen = false;
        
        // 繁衍會消耗一天
        //this.nextDay();
    },

    returnToBreedingModal(message) {
        this.screen = 'tribe';
        this.modals.construction.isOpen = true;
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';
        this.showCustomAlert(message);
    },

    handleBreedingClick() {
        // --- 這是按鈕點擊後的總控制器 ---

        // 1. 先執行所有前置檢查
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;
        if (selectedCount === 0) {
            this.showCustomAlert('請至少選擇一名繁衍對象。');
            return;
        }
        if (selectedCount > this.breedingChargesLeft) {
            this.showCustomAlert(`繁衍次數不足！你只能選擇最多 ${this.breedingChargesLeft} 位。`);
            return;
        }
        if (this.captives.length + selectedCount > this.captiveCapacity) {
            this.showCustomAlert(`地牢空間不足！剩餘空間：${this.captiveCapacity - this.captives.length}`);
            return;
        }

        // 2. 智慧判斷：根據有無 API Key 決定流程
        if (this.userApiKey && this.userApiKey.trim() !== '') {
            // 如果有 Key，執行AI敘事流程
            this.startBreedingNarrative();
        } else {
            // 如果沒有 Key，執行快速繁衍
            this.executeQuickBreeding();
        }
    },

    loadMusic(event) {
        const file = event.target.files[0];
        if (file) {
            // 釋放舊的 URL 避免內存洩漏
            if (this.musicSettings.src) {
                URL.revokeObjectURL(this.musicSettings.src);
            }
            // 建立新的檔案 URL
            this.musicSettings.src = URL.createObjectURL(file);
            this.$refs.audioPlayer.src = this.musicSettings.src;
            // 載入後，我們假設使用者想要播放，所以設定 isPlaying 為 true
            this.musicSettings.isPlaying = true;
            // 嘗試播放，並處理可能因瀏覽器限制而導致的自動播放失敗
            this.$refs.audioPlayer.play().catch(e => {
                console.warn("自動播放失敗，需要使用者手動互動。");
                // 如果播放失敗，將狀態同步為 false
                this.musicSettings.isPlaying = false;
            });
        }
    },

    toggleMusic() {
        // 如果沒有音樂檔案，則不執行任何操作
        if (!this.musicSettings.src) return;

        // 根據 audio 元素的實際暫停狀態來切換
        if (this.$refs.audioPlayer.paused) {
            this.$refs.audioPlayer.currentTime = 0; // 將音樂拉回開頭
            this.$refs.audioPlayer.play();
            this.musicSettings.isPlaying = true;
        } else {
            this.$refs.audioPlayer.pause();
            this.musicSettings.isPlaying = false;
        }
    },
    
    day: 1,//日
    year: 0,//年
    month: 1,//月
    currentDate: 1,
    player: null,
    partners: [],
    captives: [],
    resources: { food: 200, wood: 200, stone: 200 },
    warehouseInventory: [], 
    buildings: {
        dungeon: { level: 0, name: "地牢" },
        warehouse: { level: 0, name: "倉庫" },
        barracks: { level: 0, name: "寢室" },
        armory: { level: 0, name: "兵工廠" },
        trainingGround: { level: 0, name: "訓練場" }, 
        merchantCamp: { level: 0, name: "商人營地" },
        watchtower: { level: 0, name: "哨塔" },
    },
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
    },
    
    merchantDialogueTimeout: null,
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

    isStarving: false,
    narrativeMemory: '',
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
    hasSaveFile: false,
    isGeneratingAvatar: false,
    tempStatIncreases: { strength: 0, agility: 0, intelligence: 0, luck: 0 },
    isNewGame: true, 
    postBattleBirths: [], 
    logs: {
        tribe: [],
        raid: [],
        combat: []
    },
    playerMapPosition: { x: -100, y: -100 }, // 玩家在地圖上的位置，預設在畫面外
    selectedTarget: null, // 當前選中的目標 (建築或敵人)
    isCombatLocked: false, // 是否被巡邏隊鎖定，無法移動
    mapScale: 1, // 【新增此行】用於地圖縮放

    knightPositions: {
        '騎士': { top: '40%', left: '50%' }, // V字陣型頂點
        '槍兵': { top: '50%', left: '35%' }, // 第二排左
        '士兵': { top: '50%', left: '65%' }, // 第二排右
        '盾兵': { top: '60%', left: '20%' }, // 第三排左
        '祭司': { top: '60%', left: '80%' }, // 第三排右 (後排輔助)
        '弓兵': { top: '70%', left: '5%' },  // 第四排左 (遠程)
        '法師': { top: '70%', left: '95%' }, // 第四排右 (遠程)
    },
    
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

    getUnitFoodConsumption(unit) {
        if (!unit || !unit.stats) return 0;
        let statSum = (unit.stats.strength || 0) + (unit.stats.agility || 0) + (unit.stats.intelligence || 0) + (unit.stats.luck || 0);
        if (unit.stats.charisma) {
            statSum += unit.stats.charisma;
        }
        return Math.floor(statSum / 10);
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
    openPartnerEquipment(partnerId) {
        this.modals.partnerEquipment.partnerId = partnerId;
        this.modals.partnerEquipment.isOpen = true;
    },
    openPlayerEquipment() {
        this.modals.partnerEquipment.partnerId = 'player'; // 將目標設為 'player'
        this.modals.partnerEquipment.isOpen = true;
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

    executeTraining(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner || partner.hasBeenTrained) {
            this.showCustomAlert("此夥伴無法被訓練。");
            return;
        }

        // --- 計算並檢查食物消耗 ---
        const playerFoodCost = this.getUnitFoodConsumption(this.player);
        const partnerFoodCost = this.getUnitFoodConsumption(partner);
        const totalFoodCost = playerFoodCost + partnerFoodCost;

        if (this.resources.food < totalFoodCost) {
            this.showCustomAlert(`食物不足！本次訓練需要 ${totalFoodCost} 單位食物。`);
            return; // 食物不夠，中斷訓練
        }

        const pointsGained = this.potentialTrainingPoints;
        if (pointsGained <= 0) {
            this.showCustomAlert("以王您現在的狀態，無法為夥伴帶來任何提升。");
            return;
        }

        // --- 扣除食物並記錄日誌 ---
        this.resources.food -= totalFoodCost;
        this.logMessage('tribe', `訓練消耗了 ${totalFoodCost} 單位食物。`, 'info');

        const statKeys = ['strength', 'agility', 'intelligence', 'luck'];
        let pointDistributionLog = { strength: 0, agility: 0, intelligence: 0, luck: 0 };

        for (let i = 0; i < pointsGained; i++) {
            const randomStat = statKeys[randomInt(0, 3)];
            partner.stats[randomStat]++;
            pointDistributionLog[randomStat]++;
        }

        partner.hasBeenTrained = true;

        //   在屬性增加後，立刻更新夥伴的生命值
        partner.updateHp(this.isStarving);

        this.logMessage('tribe', `你對 ${partner.name} 進行了嚴格的訓練！`, 'player'); // 修改了日誌文字，不再提“花費一天”
        const logDetails = Object.entries(pointDistributionLog)
            .filter(([stat, value]) => value > 0)
            .map(([stat, value]) => `${STAT_NAMES[stat]} +${value}`)
            .join(', ');
        this.logMessage('tribe', `${partner.name} 的潛力被激發了：${logDetails}。`, 'success');
        
        //   顯示一個包含詳細結果的提示框
        this.showCustomAlert(`${partner.name} 的訓練完成了！\n獲得的能力提升：\n${logDetails}`);

        // this.nextDay(); // 訓練消耗一天
        this.checkAndProcessDecisions();
    },

    calculateEquipmentValue(item) {
        if (!item) return 0;

        let baseValue = 0;
        let nativeStatValue = 0;
        let qualityValue = 0;
        let affixValue = 0;

        // 1. 基礎價值 (來自製作成本，此部分不變)
        if (item.material && item.material.tier) {
            const tier = item.material.tier;
            const cost = CRAFTING_COSTS[tier];
            if (cost) {
                baseValue = (cost.food || 0) + (cost.wood || 0) + (cost.stone || 0);
            }
        }

        // 2. 原生屬性價值 (白字) - 依照您的新公式
        const stats = item.stats || {};
        if (stats.allStats) {
            nativeStatValue += (stats.allStats * 4 * 6) * 2; // e.g., 全屬性+2 -> (2*4*6)*2 = 96
        }
        if (stats.attackBonus) { // 攻擊加成視為傷害
            nativeStatValue += (stats.attackBonus * 6) * 2; // e.g., 攻擊加成+2 -> (2*6)*2 = 24
        }
        if (stats.damage) { // 武器傷害
            nativeStatValue += (stats.damage * 6) * 2;
        }
        if (stats.damageReduction) {
            nativeStatValue += stats.damageReduction * 10; // e.g., 傷害減免+6% -> 6*10 = 60
        }
        if (item.baseName === '盾') {
            // --- 盾牌的專屬價格公式 ---
            const blockTarget = stats.blockTarget || 20; // 若無目標值，預設為20 (極難成功)
            const blockChancePercent = (20 - blockTarget) * 5; // (20-目標值)*5 = 發動率%
            const blockChanceValue = blockChancePercent * 10;
            
            // 根據您的公式「10 * 25減傷」，這裡解釋為一個代表減傷潛力的固定價值 250
            const damageReductionValue = 250; 
            
            nativeStatValue += blockChanceValue + damageReductionValue;

            // 盾牌也帶有攻擊加成，需要另外計算
            if (stats.attackBonus) {
                nativeStatValue += (stats.attackBonus * 6) * 2;
            }
        } else {
            // --- 其他所有非盾牌裝備的價格公式 ---
            if (stats.allStats) {
                nativeStatValue += (stats.allStats * 4 * 6) * 2;
            }
            if (stats.attackBonus) {
                nativeStatValue += (stats.attackBonus * 6) * 2;
            }
            if (stats.damage) {
                nativeStatValue += (stats.damage * 6) * 2;
            }
            if (stats.damageReduction) {
                nativeStatValue += stats.damageReduction * 10;
            }
        }

        // 3. 品質價值
        if (item.qualityBonus) {
            qualityValue = item.qualityBonus * 10; // e.g., 品質+1 -> 1*10 = 10
        }

        // 4. 詞綴價值 (綠字/藍字等)
        if (item.affixes && item.affixes.length > 0) {
            let calculatedAffixValue = 0;
            item.affixes.forEach(affix => {
                let singleAffixValue = 0;
                
                // A. 屬性類詞綴
                if (affix.type === 'stat') {
                    affix.effects.forEach(effect => {
                        if (['strength', 'agility', 'intelligence', 'luck'].includes(effect.stat)) {
                            singleAffixValue += (effect.value * 6) * 2;
                        } else if (effect.stat === 'all') {
                            singleAffixValue += (effect.value * 4 * 6) * 2;
                        } else if (effect.stat === 'hp') {
                            singleAffixValue += effect.value; // HP直接等於價值
                        }
                    });
                }
                // B. 武器傷害加成類詞綴
                else if (affix.type === 'weapon_damage') {
                    affix.effects.forEach(effect => {
                        const percentage = effect.multiplier * 100;
                        singleAffixValue += 2 * 6 * percentage; // e.g., 10% -> 2*6*10 = 120
                    });
                }
                // C. 機率觸發類詞綴
                else if (affix.type === 'proc') {
                    const procInfo = affix.procInfo;
                    switch(affix.key) {
                        case 'vampiric':
                            singleAffixValue += procInfo.baseRate * 10 * 3; // 300
                            break;
                        case 'spiky':
                            singleAffixValue += procInfo.baseRate * 10 * 6; // 600
                            break;
                        case 'multi_hit':
                            singleAffixValue += procInfo.baseRate * 10 * 6; // 300
                            break;
                        case 'regenerating':
                            singleAffixValue += (procInfo.value * 100) * 100; // 500
                            break;
                        case 'blocking':
                             singleAffixValue += procInfo.baseRate * 10 * 6 * 2; // 600
                            break;
                        case 'penetrating':
                             singleAffixValue += procInfo.baseRate * 10 * 6; // 600
                            break;
                    }
                } 
                
                // D. 特殊效果類詞綴 (例如爆擊模組)
                else if (affix.key === 'devastating') {
                    // 根據您的公式設定價值
                    singleAffixValue += 50 * 6 * 2; // 600
                }

                else if (affix.type === 'weapon_damage') {
                    const effect = affix.effects[0]; // 取得效果設定
                    if (effect) {
                        const statName = STAT_NAMES[effect.stat] || effect.stat; // 將 'agility' 轉為 '敏捷'
                        const percentage = effect.multiplier * 100; // 將 0.2 轉為 20
                        const effectString = `傷害增加 ${percentage}% 有效${statName}`;
                        parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);
                    }
                }           
                
                // 根據您的規則：扣除生命後，能力依舊是加上去的，所以價值不為負數。
                calculatedAffixValue += Math.max(0, singleAffixValue);
            });
            affixValue = calculatedAffixValue;
        }

        // 5. 最終總價值
        const totalValue = baseValue + nativeStatValue + qualityValue + affixValue;
        return Math.max(1, Math.floor(totalValue));
    },

    calculateCaptiveValue(captive) {
        if (!captive) return 0;
        const hp = captive.calculateMaxHp();
        // 根據GDD: 俘虜價值 = 該俘虜當前總生命值 × 1.5
        return Math.floor(hp * 1.5);
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
    //   根據商店狀態更新商人對話的函式
    updateMerchantDialogue() {
        if (this.merchant.goods.length === 0) {
            this.merchant.dialogue = "「哎呀...這麼想我嗎？會有下次的」";
        } else {
            this.merchant.dialogue = "「嘿嘿嘿...哥布林王...今天有什麼「好貨」？買點好東西嗎？」";
        }
    },

    //   打開商人介面的準備函式
    openMerchant() {
        this.updateMerchantDialogue(); // 先設定好初始對話
        this.modals.merchant.isOpen = true; // 再打開介面
    },
    executeTrade() {
        if (!this.canExecuteTrade) {
            this.showCustomAlert("交易條件不滿足！");
            return;
        }

        const tradedItems = this.selectedItems;
        const tradedItemIds = new Set(this.merchant.selectedItemIds);
        const tradedCaptiveIds = new Set(this.merchant.selectedCaptiveIds);

        // 使用深拷貝複製物品，而不是直接轉移物件參照
        const newItemsForPlayer = JSON.parse(JSON.stringify(tradedItems));
        // --- 為交易來的物品重新產生ID，避免ID衝突 ---
        newItemsForPlayer.forEach(item => item.id = crypto.randomUUID());
        this.player.inventory.push(...newItemsForPlayer);
        this.logMessage('tribe', `你用俘虜換來了 ${tradedItems.length} 件裝備！`, 'success');

        const tradedCaptives = this.captives.filter(c => tradedCaptiveIds.has(c.id));
        this.captives = this.captives.filter(c => !tradedCaptiveIds.has(c.id));
        this.logMessage('tribe', `你失去了 ${tradedCaptives.map(c => c.name).join(', ')} 這 ${tradedCaptives.length} 名俘虜。`, 'info');

        this.merchant.goods = this.merchant.goods.filter(g => !tradedItemIds.has(g.id));
        this.merchant.selectedItemIds = [];
        this.merchant.selectedCaptiveIds = [];

        //    根據交易後的狀態更新對話
        if (this.merchant.goods.length === 0) {
            // 如果商品被買完了
            this.merchant.dialogue = "「真是大手筆，歡迎下次再來」";
        } else {
            // 如果還有商品
            this.merchant.dialogue = "「眼光不錯，這裝備肯定能成為助力」";
            // 讓這句「反應式對話」停留 4 秒後，再恢復成預設對話
            clearTimeout(this.merchantDialogueTimeout); // 先清除舊的，以防萬一
            this.merchantDialogueTimeout = setTimeout(() => {
                this.updateMerchantDialogue();
            }, 4000);
        }

        // 5. 處理彩蛋計數
        this.merchant.purchases++;
        if (this.merchant.purchases === 47) {
            const shijiClone = new FemaleHuman(
                '世紀的分身', 
                { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: 147 },
                '魅魔',
                { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' }
            );
            this.captives.push(shijiClone);
            this.showCustomAlert("「呵...你很懂『交易』嘛...。這個福利就送給你，哥布林王...」你發現一名特殊的魅魔出現在了你的地牢中！");
            this.logMessage('tribe', `你達成了與「世紀」的第47次交易，獲得了特殊俘虜 [世紀的分身]！`, 'system');
        }
    },

    breedingChargesLeft: 0,
    
    currentRaid: null,
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

        // --- 修改核心：改用 narrative modal ---
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

    init() {
        this.loadApiKey();
        this.logMessage('tribe', "哥布林王國v5.56 初始化...");
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

    creation: {
        name: '哥布林王', height: 130, penisSize: 10,
        appearance: '有著一對尖耳朵、狡猾的眼神、戴著骨頭項鍊的綠皮膚哥布林',
        stats: { strength: 10, agility: 10, intelligence: 10, luck: 10 },
        statWarningMessage: '',
        lowStatWarnings: {},
        get pointsRemaining() { return 40 - Object.values(this.stats).reduce((a, b) => a + b, 0); }
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
    executeBailout() {
        this.resources.food = 200;
        this.resources.wood = 200;
        this.resources.stone = 200;
        this.modals.bailoutConfirm.isOpen = false;
        // 使用 setTimeout 確保提示框在對話框關閉後再弹出
        setTimeout(() => {
            this.showCustomAlert('世紀「真是拿你沒辦法…資源已經恢復了。快去「部落建設」裡，優先建造「地牢」和「產房」吧！」');
        }, 100);
    },
    // 處理拒絕求助的函式
    refuseBailout() {
        this.bailoutOfferedButRefused = true;
        this.modals.bailoutConfirm.isOpen = false;
    },
    // 處理求助對話框的確認步驟
    confirmBailoutStep() {
        const modal = this.modals.bailoutConfirm;
        modal.currentMessageIndex++;
        // 如果還有下一個問題，就繼續問
        if (modal.currentMessageIndex < modal.messages.length) {
            // 這部分會讓 modal 的內容更新為下一個問題
        } else {
            // 所有問題都回答「是」了，執行最終的確認動作
            if (typeof modal.onConfirm === 'function') {
                modal.onConfirm();
            }
        }
    },

    //   啟動求助流程的主函式
    handleBailoutRequest() {
        this.bailoutCounter++; // 求助次數+1
        const modal = this.modals.bailoutConfirm;
        
        let questions = ["世紀「你是否承認自己跳過新手教學很呆?」"];
        const extraQuestions = ["世紀「真的嗎?」", "世紀「你確定?」", "世紀「沒有一點遲疑?」", "世紀「好吧，既然你都說到這個份上了...」", "世紀「最後一次機會囉?」", "世紀「我是誰?先回答你是不是呆瓜比較重要」", "世紀「我是誰?你之後就知道了。所以你是呆瓜嗎?」", "世紀「嘿...你不是第一次對吧?」", "世紀「嘿...騙我的話，我會知道的。你是呆瓜嗎?」"];
        
        // 根據求助次數，決定要問幾次問題
        for (let i = 0; i < this.bailoutCounter; i++) {
            questions.push(extraQuestions[i % extraQuestions.length]); // 循環使用額外問題
        }

        modal.messages = questions;
        modal.currentMessageIndex = 0;
        modal.onConfirm = () => this.executeBailout();
        modal.isOpen = true;
    },

    handleConstructionClick() {
        this.modals.construction.isOpen = true;

        //  對應新的步驟編號，現在檢查步驟2
        if (this.tutorial.active && this.tutorial.step === 2) {
            setTimeout(() => {
                this.advanceTutorial(3); // 推進到步驟3
            }, 100);
        }
    },
    
    handleRaidButtonClick() {
        // 步驟 1: 首先檢查是否滿足最基本的掠奪條件
        const canRaid = this.buildings.dungeon.level > 0;

        if (canRaid) {
            // 條件滿足：直接切換到掠奪選擇畫面
            this.screen = 'raid_selection';

            // 教學邏輯可以放在這裡
            if (this.tutorial.active && this.tutorial.step === 5) {
                this.advanceTutorial(5.5);
            }

        } else {
            // 條件不滿足：執行提示與潛在的求助流程
            this.showCustomAlert('必須先建造「地牢」，才能出擊！', () => {
                // 在玩家關閉提示後，檢查是否卡關
                const isStuck = this.resources.food < 200 || this.resources.wood < 200 || this.resources.stone < 200;
                
                // 只有在「真的沒資源蓋房子」時才觸發求助
                if (isStuck) {
                    this.handleBailoutRequest();
                }
            });
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
    
    getBuildingUpgradeCost(type) {
        const building = this.buildings[type];
        if (!building) return { food: 0, wood: 0, stone: 0 };
        const level = building.level;

        let cost = { food: 0, wood: 0, stone: 0 };

        switch (type) {
            case 'dungeon':
                // 更新地牢的升級邏輯
                if (level >= 5) return { food: Infinity, wood: Infinity, stone: Infinity }; // 最高 5 級
                const dungeonCosts = [100, 200, 400, 800, 1600]; // 建立一個成本對照表
                const resourceCost = dungeonCosts[level];
                cost = { food: resourceCost, wood: resourceCost, stone: resourceCost };
                break;
            // 哨塔的升級成本邏輯
            case 'watchtower':
                if (level >= 5) return { food: Infinity, wood: Infinity, stone: Infinity };
                cost = { food: 50 * multiplier, wood: 100 * multiplier, stone: 100 * multiplier };
                break;    
            case 'warehouse':
                if (level >= 6) return { food: Infinity, wood: Infinity, stone: Infinity };
                cost = { food: 0, wood: 100 * multiplier, stone: 100 * multiplier };
                break;
            case 'barracks':
                if (level >= 5) return { food: Infinity, wood: Infinity, stone: Infinity };
                cost = (level === 0)
                    ? { food: 100, wood: 150, stone: 150 }
                    : { food: 100 * multiplier, wood: 150 * multiplier, stone: 150 * multiplier };
                break;
            case 'armory':
                if (level >= 4) return { food: Infinity, wood: Infinity, stone: Infinity };
                cost = (level === 0)
                    ? { food: 0, wood: 150, stone: 150 }
                    : { food: 0, wood: 150 * multiplier, stone: 150 * multiplier };
                break;
            case 'trainingGround':
                if (level === 0) return { food: 200, wood: 150, stone: 150 };
                return { food: Infinity, wood: Infinity, stone: Infinity };
            case 'merchantCamp':
                if (level >= 4) return { food: Infinity, wood: Infinity, stone: Infinity };
                cost = (level === 0)
                    ? { food: 200, wood: 200, stone: 200 }
                    : { food: 200 * multiplier, wood: 200 * multiplier, stone: 200 * multiplier };
                break;
            default:
                return cost;
        }

        // --- 應用「建築學」技能效果 ---
        const skillId = 'tribe_architecture';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillLevel = this.player.learnedSkills[skillId];
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            const reduction = skillData.levels[skillLevel - 1].effect.cost_reduction;
            cost.food = Math.floor(cost.food * (1 - reduction));
            cost.wood = Math.floor(cost.wood * (1 - reduction));
            cost.stone = Math.floor(cost.stone * (1 - reduction));
        }
        
        return cost;
    },
    canAffordBuildingUpgrade(type) {
        const cost = this.getBuildingUpgradeCost(type);
        const foodCost = cost.food || 0;
        return this.resources.food >= foodCost && this.resources.wood >= cost.wood && this.resources.stone >= cost.stone;
    },
    upgradeBuilding(type) {
        const building = this.buildings[type];
        const maxLevels = { dungeon: 6, warehouse: 6, barracks: 5, armory: 4, maternity: 6, merchantCamp: 4 };
        if (building.level >= maxLevels[type]) { this.showCustomAlert(`${building.name}已達到最大等級！`); return; }
        if (!this.canAffordBuildingUpgrade(type)) { this.showCustomAlert("資源不足！"); return; }
        
        const cost = this.getBuildingUpgradeCost(type);
        this.resources.food -= (cost.food || 0);
        this.resources.wood -= cost.wood;
        this.resources.stone -= cost.stone;
        building.level++;
        this.logMessage('tribe', `${building.name}${building.level === 1 ? '建造完成' : `升級至 ${building.level} 級`}！`, 'success');

        if (this.tutorial.active && type === 'armory' && building.level === 1 && !this.tutorial.finishedDecomposing) {
            this.triggerTutorial('armoryBuilt');
        }

        if (this.tutorial.active) {
            setTimeout(() => {
                //  對應新的步驟編號
                if (type === 'dungeon' && this.tutorial.step === 3 && building.level === 1) {
                    this.advanceTutorial(5);
                } 
            }, 50);
        }
    },
    
    startBreedingNarrative() {
        // --- 準備並打開 AI 敘事視窗 (前置檢查已由 handleBreedingClick 完成) ---
        const modal = this.modals.narrative;
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCaptives = this.captives.filter(c => selectedIds.includes(c.id));

        //  準備好狀態
        modal.title = "繁衍";
        modal.type = "breeding";
        modal.isAwaitingConfirmation = true; // 預設為等待確認狀態
        modal.isLoading = false;
        modal.context = [];
        modal.currentCaptives = selectedCaptives;
        modal.hasBred = false;
        
        //  關閉當前視窗，並切換到新的專屬敘事畫面
        this.modals.construction.isOpen = false;
        this.screen = 'breeding_narrative'; 
    },
    confirmAndStartBreedingNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // 直接進入敘事階段
        modal.isLoading = true;
        this.generateNarrativeSegment('開始'); // 觸發第一段與繁衍相關的AI敘事
    },
    closeNarrativeModal() {
        if (this.modals.narrative.type === 'breeding' && this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
            this.nextDay();
        }
        
        if (this.modals.narrative.type === 'birth') {
            this.screen = 'tutorial_query';
        }

        // 對 tutorial 類型的處理 (現在也包含了老婦對話)
        if (this.modals.narrative.type === 'tutorial') {
            // 不需要做任何事，直接關閉即可
        }

        this.modals.narrative.isOpen = false;
        // 可以在此處重置 modal 狀態以策安全
        this.modals.narrative.type = '';
        this.modals.narrative.content = '';
    },

    confirmNarrativeModal() {
        const modal = this.modals.narrative;
        modal.isOpen = false;
        if (typeof modal.onConfirm === 'function') {
            // 延遲執行，確保 modal 動畫結束
            setTimeout(() => {
                modal.onConfirm();
                modal.onConfirm = null; // 清理回呼
            }, 200);
        }
    },

    finalizeBreedingAndReturn() {
        if (this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
            //this.nextDay();
        }
        // 呼叫新的共用函式
        this.returnToBreedingModal('繁衍已完成！');
    },

    executeQuickBreedingAndReturn() {
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        // 執行繁衍的核心遊戲機制
        selectedIds.forEach(id => {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                // 增加繁衍計數
                this.totalBreedingCount++; 
            }
        });

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        
        // 清理並觸發下一天
        this.modals.dungeon.selectedBreedIds = [];
        //this.nextDay();

        //  返回部落畫面的同時，重新打開「部落建設」視窗
        this.screen = 'tribe';
        this.modals.construction.isOpen = true;

        //   為了更好的體驗，直接定位回繁衍分頁
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';

        //   顯示操作成功的提示框
        this.showCustomAlert('繁衍已完成！');
    },

    async confirmAndNarrateBreeding() {
        // 防止重複觸發
        if (this.modals.narrative.hasBred) return;

        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;
        
        // 我們將原本的兩個迴圈合併為一個，更有效率
        for (const id of selectedIds) {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                // 執行繁衍的遊戲機制
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                this.totalBreedingCount++;// 同時在這裡增加總繁衍計數
                // 檢查是否觸發 Boss 戰
                if (this.totalBreedingCount === 69) {
                    this.pendingDecisions.push({ type: 'apostle_battle' });
                    break; 
                }
                if (this.flags.defeatedApostle && this.totalBreedingCount === 88) {
                    this.pendingDecisions.push({ type: 'goddess_battle' });
                    break;
                }
            }
        }

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');

        // 標記繁衍已完成
        this.modals.narrative.hasBred = true;

        // 命令 AI 生成對應的敘事文本
        await this.generateNarrativeSegment('繁衍');
    },

    async generateIntroNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // 關閉確認狀態
        modal.isLoading = true;
        modal.content = '';
        modal.title = "序幕";
        modal.type = "intro";
        const prompt = "來玩角色扮演遊戲。玩家於現實世界中抑鬱而終，當再次睜開雙眼，發現自己來到了一個劍與魔法的異世界。然而，並未成為勇者或魔王，而是轉生成了一隻最弱小的生物——哥布林。更奇怪的是，孤身一人，身邊沒有任何同伴。在這個對哥布林充滿敵意的世界，必須依靠自己，從零開始，建立只屬於自己的部落，向世界宣告哥布林王的崛起。請生成一段約150字的遊戲開場白，描述玩家是一位在現代社會中感到抑鬱與不滿的人，人生忽然迎來終點，張著眼，世界逐漸融化且意識逐漸模糊，漸漸感到冰冷，忽然就發現自己倒在另一個地方。風格請帶有黑暗奇幻的色彩。";
        
        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
        } catch (error) {
            modal.content = error.message;
        } finally {
            modal.isLoading = false;
        }
    },
    async generateBirthNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // <<< 新增
        modal.isLoading = true;
        modal.content = ''; // 清空提示文字

        const prompt = `玩家發現自己變成了哥布林。請根據以下新誕生的哥布林王資訊，生成一段約150字，黑暗奇幻風格的誕生故事。描述如何在一個陌生的世界甦醒，感受自己全新的、醜陋、非人而強大的哥布林身體，且需要繁衍以壯大自己的部落。\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm`;

        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
            this.narrativeMemory = text;
        } catch (error) {
            modal.content = error.message;
        } finally {
            modal.isLoading = false;
        }
    },
    async generateNarrativeSegment(action) {
        const modal = this.modals.narrative;
        modal.isLoading = true;
        modal.title = "繁衍";
        modal.type = "breeding";
        
        const captives = modal.currentCaptives;
        const isSoloScene = captives.length === 1 && this.player.party.length === 0;
        let prompt = '';
        
        const baseInstruction = "以哥布林王的視角，描寫一段與地牢俘虜的繁衍過程。";

        if (isSoloScene) {
            const captive = captives[0];
            const captiveDetails = `- 名稱: ${captive.name}, 職業: ${captive.profession}, 個性: ${captive.visual.personality}, 髮色: ${captive.visual.hairColor}, 髮型: ${captive.visual.hairStyle}, ${captive.visual.bust}罩杯, 身高 ${captive.visual.height}cm, 年紀 ${captive.visual.age}歲, 服裝: ${captive.visual.clothing}, 已被繁衍次數: ${captive.breedingCount || 0}`;
            if (modal.context.length === 0) {
                prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n\n**女性俘虜資訊:**\n${captiveDetails}\n\n故事從哥布林王決定 "${action}" 開始。描寫地牢環境，以及哥布林王打牢房，進入到內。\n請撰寫一段約100-200字，充滿氣氛和細節的開場故事，以及女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\敘事描述每一個動作、行為、生理反應及雙方感受。`;
            } else {
                const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約100-200字），保持風格一致，並描寫女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
            }
        } else { // Group scene
            let captivesDetails = captives.map(c => `- 名稱: ${c.name}, 職業: ${c.profession}, 個性: ${c.visual.personality}, 髮色: ${c.visual.hairColor}, 髮型: ${c.visual.hairStyle}, ${c.visual.bust}罩杯, 身高 ${c.visual.height}cm, 年紀 ${c.visual.age}歲, 服裝: ${c.visual.clothing}, 已被繁衍次數: ${c.breedingCount || 0}`).join('\n');
            let partnersDetails = this.player.party.length > 0 ? `你的哥布林夥伴們 (${this.player.party.map(p => p.name).join(', ')}) 也一同參與。` : '';
            if (modal.context.length === 0) {
                prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n${partnersDetails}\n\n**女性俘虜資訊:**\n${captivesDetails}\n\n故事從哥布林王決定 "${action}" 開始。請詳細描寫地牢環境，以及哥布林王打牢房，進入到內。\n請撰寫一段約200-250字，充滿氣氛和細節的開場故事。哥布林王以及女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\敘事將描述每一個動作、行為、生理反應及雙方感受。`;
            } else {
                const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約100-200字），保持風格一致，並描寫女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
            }
        }

        modal.context.push({ user: action });

        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
            modal.context[modal.context.length - 1].model = text;
        } catch (error) {
            modal.content = error.message;
            modal.context.pop();
        } finally {
            modal.isLoading = false;
        }
    },
    async callGeminiAPI(prompt, temperature = 0.7) {
        //  如果沒有金鑰，則直接回傳提示訊息，不發出請求
        if (!this.userApiKey || this.userApiKey.trim() === '') {
            return "（AI 敘事功能需要 API 金鑰。請刷新頁面，在初始畫面中輸入您的金鑰。）";
        }

        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { 
            contents: chatHistory,
            generationConfig: {
                temperature: temperature
            }
        };
        //  使用玩家輸入的金鑰
        const apiKey = this.userApiKey; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // 如果 API 金鑰無效或出錯，也給予明確提示
            if (response.status === 400) {
                return "（您的 API 金鑰無效或已過期，請刷新頁面重新輸入。）";
            }
            //   處理請求頻率過高的錯誤
            if (response.status === 429) {
                return "（對AI的請求過於頻繁，已觸發流量限制，請稍後再試。）";
            }
            throw new Error(`API request failed with status ${response.status}`);
        }
        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected API response structure:", result);
            let errorMessage = "無法生成故事，可能是因為內容限制。";
            if (result.promptFeedback && result.promptFeedback.blockReason) {
                errorMessage += ` (原因: ${result.promptFeedback.blockReason})`;
            }
            return `（${errorMessage}）`; // 將錯誤訊息回傳到畫面上
        }
    },   
        
    giveBirth(mother) {
        if (!mother || !mother.stats) {
            this.logMessage('tribe', `一名孕母的資料異常，本次生產失敗！`, 'enemy');
            if(mother) { mother.isPregnant = false; mother.pregnancyTimer = 0; }
            return;
        }

        let numberOfBirths = 1;
        // --- 處理「多精卵」技能 ---
        const polyspermySkillId = 'breed_polyspermy';
        if (this.player && this.player.learnedSkills[polyspermySkillId]) {
            const skillLevel = this.player.learnedSkills[polyspermySkillId];
            const skillData = SKILL_TREES.breeding.find(s => s.id === polyspermySkillId);
            const effect = skillData.levels[skillLevel - 1].effect;
            
            const roll = Math.random(); // 產生一個 0 到 1 之間的亂數
            if (effect.triplets_chance && roll < effect.triplets_chance) {
                numberOfBirths = 3;
                this.logMessage('tribe', `奇蹟發生了！在「多精卵」的影響下，${mother.name} 誕下了三胞胎！`, 'crit');
            } else if (roll < (effect.triplets_chance || 0) + effect.twins_chance) {
                numberOfBirths = 2;
                this.logMessage('tribe', `在「多精卵」的影響下，${mother.name} 誕下了雙胞胎！`, 'success');
            }
        }
        // --- 繁衍公式
        for (let i = 0; i < numberOfBirths; i++) {
            const pStats = this.player.stats;
            const mStats = mother.stats;
            let newStats = {
                strength: Math.floor(((pStats.strength || 0) + (mStats.strength || 0)) / 4 + (mStats.charisma || 0) / 2),
                agility: Math.floor(((pStats.agility || 0) + (mStats.agility || 0)) / 4 + (mStats.charisma || 0) / 2),
                intelligence: Math.floor(((pStats.intelligence || 0) + (mStats.intelligence || 0)) / 4 + (mStats.charisma || 0) / 2),
                luck: Math.floor(((pStats.luck || 0) + (mStats.luck || 0)) / 4 + (mStats.charisma || 0) / 2)
            };

            // --- 處理「優生學」技能 ---
            const eugenicsSkillId = 'breed_eugenics';
            if (this.player && this.player.learnedSkills[eugenicsSkillId]) {
                const skillLevel = this.player.learnedSkills[eugenicsSkillId];
                const skillData = SKILL_TREES.breeding.find(s => s.id === eugenicsSkillId);
                const chance = skillData.levels[skillLevel - 1].effect.chance;

                if (Math.random() < chance) {
                    const rawStatSum = pStats.strength + pStats.agility + pStats.intelligence + pStats.luck;
                    const bonusPoints = Math.floor(rawStatSum / 10);
                    if (bonusPoints > 0) {
                        this.logMessage('tribe', '在「優生學」的影響下，一名後代獲得了額外的潛力！', 'success');
                        for (let j = 0; j < bonusPoints; j++) {
                            const randomStat = ['strength', 'agility', 'intelligence', 'luck'][randomInt(0, 3)];
                            newStats[randomStat]++;
                        }
                    }
                }
            }

            const newName = `(${(mother.profession || '未知')}${(mother.name || '無名')}之子)哥布林`;
            const newPartner = new Goblin(newName, newStats);
            newPartner.maxHp = newPartner.calculateMaxHp(this.isStarving);
            newPartner.currentHp = newPartner.maxHp;

            this.postBattleBirths.push({ mother: mother, newborn: newPartner });
        }

        mother.isPregnant = false;
        mother.pregnancyTimer = 0;
        mother.isMother = true;
        this.logMessage('tribe', `${mother.name} 現在開始在產房為部落貢獻奶水。`, 'info');
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

    removeAllCaptives(reason) {
        if (this.captives.length === 0) {
            return;
        }

        // 定義哪些職業是特殊單位，不會被救走
        const specialProfessions = ['魅魔', '女神', '使徒'];

        if (reason === 'rescued') {
            // 篩選出「會」被救走的普通俘虜
            const rescuedCaptives = this.captives.filter(c => !specialProfessions.includes(c.profession));
            const rescuedCount = rescuedCaptives.length;

            if (rescuedCount > 0) {
                this.logMessage('tribe', `復仇小隊趁亂將你的 ${rescuedCount} 名俘虜救走了！`, 'enemy');
            } else {
                this.logMessage('tribe', `復仇小隊試圖解救俘虜，但特殊俘虜拒絕離開。`, 'info');
            }
        }
        
        // 核心邏輯：只保留特殊職業的俘虜，其餘全部移除
        this.captives = this.captives.filter(c => specialProfessions.includes(c.profession));
    },

    
    releaseCaptive(captiveId) {
        const captive = this.captives.find(c => c.id === captiveId);
        if (captive) {
            this.captives = this.captives.filter(c => c.id !== captiveId);
            this.logMessage('tribe', `你拋棄了 ${captive.isMother ? '孕母' : '俘虜'} ${captive.name}。`, 'info');
        }
    },
    moveMotherToDungeon(captiveId) {
        const captive = this.captives.find(c => c.id === captiveId);
        if (captive) {
            if (captive.isPregnant) {
                this.showCustomAlert(`${captive.name} 正在懷孕中，無法移動！`);
                return;
            }
            //   檢查地牢容量
            if (this.dungeonCaptives.length >= this.captiveCapacity) {
                this.showCustomAlert(`地牢空間已滿 ( ${this.dungeonCaptives.length} / ${this.captiveCapacity} )，無法移入更多俘虜！`);
                return;
            }
            captive.isMother = false;
            this.logMessage('tribe', `${captive.name} 已被移回地牢，等待繁衍。`, 'info');
        }
    },

    //步驟1.1：一個私有的輔助函式，負責將夥伴從所有隊伍中移除
    _removePartnerFromAllAssignments(partnerId) {
        // 從出擊隊伍中移除
        this.player.party = this.player.party.filter(p => p.id !== partnerId);
        // 從所有派遣隊伍中移除
        Object.keys(this.dispatch).forEach(task => {
            this.dispatch[task] = this.dispatch[task].filter(id => id !== partnerId);
        });
    },

    // 權威的「指派夥伴」函式
    assignPartner(partnerId, task) { // task可以是 'party', 'hunting', 'logging', 'mining'
        // 1. 先將該夥伴從所有舊的隊伍中移除，確保狀態乾淨
        this._removePartnerFromAllAssignments(partnerId);

        // 2. 根據任務類型，將夥伴加入到新的隊伍中
        if (task === 'party') {
            const partner = this.partners.find(p => p.id === partnerId);
            if (partner && this.player.party.length < 20) {
                this.player.party.push(partner);
            }
        } else if (this.dispatch[task]) {
            if (this.dispatch[task].length < 10) {
                this.dispatch[task].push(partnerId);
            }
            // 為哨塔增加指派邏輯
        } else if (task === 'watchtower') {
            if (this.dispatch.watchtower.length < 5) { // 哨塔容量上限為 5
                this.dispatch.watchtower.push(partnerId);
            }
        } else if (this.dispatch[task]) {
            if (this.dispatch[task].length < 10) {
                this.dispatch[task].push(partnerId);
            }
        }
        
        
        // 3. 任何隊伍的變動都可能影響玩家血量，統一更新
        this.player.updateHp(this.isStarving);
    },

     // 一個純粹的內部函式，專門負責執行移除夥伴的最終動作
    _finalizePartnerRemoval(partnerId) {
        // 【修正】直接在 partners 陣列中尋找夥伴，而不是呼叫不存在的函式
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return; // 如果找不到夥伴，就提前結束，增加程式碼穩健性
        const partnerName = partner.name || '一名夥伴';

        // 1. 從所有隊伍指派中移除
        this._removePartnerFromAllAssignments(partnerId);

        // 2. 從部落夥伴總名單中移除
        this.partners = this.partners.filter(p => p.id !== partnerId);

        // 3. 更新玩家狀態並記錄日誌
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你將 ${partnerName} 逐出了部落。`, 'info');
    },

    // releasePartner 現在是唯一的入口，負責處理所有前置檢查
    releasePartner(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;

        const itemsToReturn = Object.values(partner.equipment).filter(item => item !== null);
        
        if (itemsToReturn.length > 0) {
            const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
            
            if (itemsToReturn.length > availableSpace) {
                this.modals.itemManagement = {
                    isOpen: true,
                    title: `處理 ${partner.name} 的裝備`,
                    message: `倉庫與背包空間不足！請先處理以下裝備，直到剩餘數量小於等於 ${availableSpace}。`,
                    items: [...itemsToReturn],
                    capacity: availableSpace,
                    // 原本這裡會再次呼叫 releasePartner，導致重複操作。現在修正為直接呼叫最終的移除函式，避免重複放入裝備。
                    onConfirm: () => this._finalizePartnerRemoval(partnerId) 
                };
                return; // 中斷本次執行，等待玩家處理
            } else {
                // 空間足夠：自動轉移裝備
                itemsToReturn.forEach(item => {
                    if (this.warehouseInventory.length < this.warehouseCapacity) {
                        this.warehouseInventory.push(item);
                    } else {
                        this.player.inventory.push(item);
                    }
                });
                this.logMessage('tribe', `已將 ${partner.name} 的 ${itemsToReturn.length} 件裝備自動移至倉庫/背包。`, 'info');
            }
        }
        
        // 所有前置條件都已滿足，執行最終的移除
        this._finalizePartnerRemoval(partnerId);
    },

    cleanupDispatchLists() {
        // 取得一份當前所有合法夥伴ID的集合，方便快速查找
        const allCurrentPartnerIds = new Set(this.partners.map(p => p.id));

        // 過濾每一個派遣列表，只保留ID存在於合法夥伴ID集合中的成員
        this.dispatch.hunting = this.dispatch.hunting.filter(id => allCurrentPartnerIds.has(id));
        this.dispatch.logging = this.dispatch.logging.filter(id => allCurrentPartnerIds.has(id));
        this.dispatch.mining = this.dispatch.mining.filter(id => allCurrentPartnerIds.has(id));
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

        // --- 情人節的特殊邏輯 (維持不變) ---
        if (isValentine && goods.length > 0) {
            const freeItemIndex = randomInt(0, goods.length - 1);
            goods[freeItemIndex].isFree = true;
            goods[freeItemIndex].name = `[免費] ${goods[freeItemIndex].name}`;
        }

        this.merchant.goods = goods;
    },

    confirmPartySelection() {
        // 1. 清空現有的出擊隊伍
        this.player.party = [];
        
        // 2. 透過新的指派函式，逐一將選擇的夥伴加入隊伍
        this.modals.barracks.selectedPartyIds.forEach(id => {
            this.assignPartner(id, 'party');
        });
        
        // 3. 更新玩家狀態並記錄日誌
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你更新了出擊隊伍，現在有 ${this.player.party.length} 名夥伴與你同行。`, 'info');
        this.showCustomAlert('出擊隊伍已更新！');
    },
                    
    addTempPoint(stat) {
        const spentPoints = Object.values(this.tempStatIncreases).reduce((a, b) => a + b, 0);
        if (this.player.attributePoints > spentPoints) {
            this.tempStatIncreases[stat]++;
        }
    },
    confirmAttributePoints() {
        let changesLog = [];
        for (const stat in this.tempStatIncreases) {
            if (this.tempStatIncreases[stat] > 0) {
                const increase = this.tempStatIncreases[stat];
                this.player.stats[stat] += increase;
                this.player.attributePoints -= increase;
                changesLog.push(`${STAT_NAMES[stat]} +${increase}`);
            }
        }
        this.cancelAttributePoints();
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你分配了能力點：${changesLog.join(', ')}。`, 'success');
    },
    cancelAttributePoints() {
        this.tempStatIncreases = { strength: 0, agility: 0, intelligence: 0, luck: 0 };
    },

    raidOptions: [
        { difficulty: 'easy', name: '簡單', description: '居民(15-20), 守軍(5-10)' },
        { difficulty: 'normal', name: '普通', description: '居民(20-25), 守軍(10-15)' },
        { difficulty: 'hard', name: '困難', description: '居民(25-30), 守軍(15-20)' },
        { difficulty: 'hell', name: '地獄', description: '居民(30-35), 守軍(20-25)' },
    ],
    startRaid(difficulty) {
        this.logs.raid = [];
        if (this.buildings.dungeon.level === 0) {
            this.showCustomAlert('地牢尚未建造，無法發動掠奪來抓捕俘虜！');
            return;
        }
        this.currentRaid = this.generateCity(difficulty);
        this.currentRaid.reinforcementsDefeated = false;
        this.screen = 'raid';

        this.playerMapPosition = { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 30 };

        this.logMessage('raid', `你帶領隊伍前往 ${this.currentRaid.locationName} 進行掠奪！`, 'player');
    },

    triggerRevengeSquadBattle(difficulty, pendingBirths = []) {
        this.postBattleBirths = pendingBirths;

        const squadCompositions = {
            easy:   { knights: { '士兵': 1, '盾兵': 1 }, residents: 4 },
            normal: { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1 }, residents: 5 },
            hard:   { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1, '騎士': 1, '法師': 1 }, residents: 6 },
            hell:   { knights: { '士兵': 3, '盾兵': 2, '槍兵': 2, '弓兵': 1, '騎士': 1, '法師': 1, '祭司': 1 }, residents: 7 }
        };
        //騎士團能力值
        const knightStatRanges = {
            easy: [65, 120], normal: [120, 190], hard: [190, 280], hell: [280, 360]
        };
        //居民能力值
        const residentStatRanges = {
            easy: [20, 20], normal: [20, 40], hard: [40, 80], hell: [80, 140]
        };

        const composition = squadCompositions[difficulty];
        const knightStatRange = knightStatRanges[difficulty];
        const residentStatRange = residentStatRanges[difficulty];
        let revengeSquad = [];

        // 生成騎士團成員
        for (const unitType in composition.knights) {
            for (let i = 0; i < composition.knights[unitType]; i++) {
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                const unit = rollPercentage(50) 
                    ? new FemaleKnightOrderUnit(unitType, totalStatPoints, difficulty)
                    // 修正：將參數傳遞給父類別
                    : new KnightOrderUnit(unitType, totalStatPoints, difficulty);
                this.equipEnemy(unit, difficulty);
                revengeSquad.push(unit);
            }
        }

        // 生成居民成員
        for (let i = 0; i < composition.residents; i++) {
            const totalStatPoints = randomInt(residentStatRange[0], residentStatRange[1]);
            let unit; 

            if (rollPercentage(50)) {
                const profession = PROFESSIONS[randomInt(0, PROFESSIONS.length - 1)];
                unit = new FemaleHuman(
                    FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)],
                    distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']),
                    profession,
                    generateVisuals(),
                    difficulty
                );
            } else {
                unit = new MaleHuman(
                    MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)],
                    distributeStats(totalStatPoints),
                    '男性居民',
                    difficulty
                );
            }
            this.equipEnemy(unit, difficulty);
            revengeSquad.push(unit);
        }
        
        this.combat.isReinforcementBattle = false; // 確保這個旗標是 false
        this.combat.isUnescapable = true;          // 設定為無法脫離

        // 觸發戰鬥
        this.startCombat(revengeSquad, true);
    },

    cloneApostle(originalApostle) {
        // 1. 創建一個新的使徒實例
        const newClone = new ApostleMaiden(this.combat);

        // 2. 複製當前生命值
        newClone.currentHp = originalApostle.currentHp;

        // 3. 複製所有技能的當前冷卻狀態 (深拷貝)
        newClone.skills = JSON.parse(JSON.stringify(originalApostle.skills));

        // 4. 複製所有狀態效果 (例如中毒、增益等)
        newClone.statusEffects = JSON.parse(JSON.stringify(originalApostle.statusEffects));
        
        // 5. 返回這個完美的複製體
        return newClone;
    },  

    triggerApostleBattle() {
        const apostleData = SPECIAL_BOSSES.apostle_maiden;
        this.logMessage('tribe', `你無盡的繁衍似乎觸動了世界的某種禁忌...空間被撕裂了...`, 'enemy');

        // 從 showCustomAlert 改為使用 narrative modal
        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = apostleData.name;
        modal.type = "tutorial"; // 重用教學的版面配置
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = apostleData.avatar; // 使用我們剛剛新增的頭像路徑
        modal.content = `<p class="text-lg leading-relaxed">${apostleData.dialogues.intro.join('<br><br>')}</p>`;
        
        // 設定點擊確認後要執行的動作 (開始戰鬥)
        modal.onConfirm = () => {
            const apostle = new ApostleMaiden(this.combat);
            this.startCombat([apostle], true);
        };
    },

    triggerGoddessBattle() {
        const goddessData = SPECIAL_BOSSES.spiral_goddess_mother;
        this.logMessage('tribe', `整個世界似乎都在震動...一股無法抗拒的、神聖而威嚴的意志降臨到了你的部落！`, 'enemy');

        // 從 showCustomAlert 改為使用 narrative modal
        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = goddessData.name;
        modal.type = "tutorial"; // 重用教學的版面配置
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = goddessData.avatar;
        modal.content = `<p class="text-lg leading-relaxed">${goddessData.dialogues.intro}</p>`;
        
        // 設定點擊確認後要執行的動作 (開始戰鬥)
        modal.onConfirm = () => {
            const goddess = new SpiralGoddess(this.combat);
            this.startCombat([goddess], false);
        };
    },

    triggerCroneDialogue() {
        // 使用我們之前設計的 narrative modal 來呈現對話
        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = "與老婦的對話";
        modal.type = "tutorial"; // 重用教學的版面，有頭像和文字
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = 'assets/crone_avatar.png'; // GDD中老婦的頭像路徑
        modal.content = `
            <p class="text-lg leading-relaxed">「有趣...如今獲得了看似無敵的權能，即使在此將你抹除，你也只會再次於那個破舊的部落中醒來。但眾神的目光永遠注視著你。」</p>
            <br>
            <p class="text-lg leading-relaxed">「給你一個忠告，孩子，關於『世紀』...要記住，魔鬼總是藏在細節裡，不要輕信惡魔的甜言蜜語。」</p>
            <br>
            <p class="text-lg leading-relaxed">「還有...不要做得太過火了，過往的哥布林一族，正是因為無盡的貪婪與暴力才招致滅亡...不要重蹈覆轍，也不要與過去加害哥布林一族的人一樣。」</p>
            <br>
            <p class="text-lg leading-relaxed">「另外，別太自滿了...真正的我們，是你無法觸及的存在。你走吧...」</p>
        `;
        // 我們需要修改 closeNarrativeModal 來處理這個新的對話類型
    },

    generateCity(difficulty) {
        const config = {
            easy:    { time: 300, zones: ['外城', '內城'], pop: [10, 15], guards: [5, 10], knightStats: [65, 120] },
            normal: { time: 240, zones: ['外城', '內城A', '內城B'], pop: [15, 25], guards: [10, 15], knightStats: [120, 190] },
            hard:    { time: 180, zones: ['外城', '內城A', '內城B', '內城C'], pop: [25, 30], guards: [15, 20], knightStats: [190, 280] },
            hell:    { time: 120, zones: ['外城', '內城A', '內城B', '內城C', '王城'], pop: [35, 40], guards: [20, 25], knightStats: [280, 360] }
        };
        const cityConfig = config[difficulty];
        const nameConfig = CITY_NAMES[difficulty];
        const locationName = nameConfig.prefixes[randomInt(0, nameConfig.prefixes.length - 1)] + nameConfig.suffix;

        let city = {
            difficulty, locationName, timeRemaining: cityConfig.time, zones: [],
            currentZoneIndex: 0,
            get currentZone() { return this.zones[this.currentZoneIndex]; },
            carriedCaptives: [],
            failedSneakTargets: new Set()
        };

        city.zones = cityConfig.zones.map(name => ({
            name: name,
            buildings: [], 
            enemies: [],
            resources: { food: 0, wood: 0, stone: 0 }
        }));
        
        const gridCols = Math.floor(MAP_WIDTH / GRID_SIZE);
        const gridRows = Math.floor(MAP_HEIGHT / GRID_SIZE);
        city.zones.forEach(zone => {
            zone.placementGrid = Array(gridRows).fill(null).map(() => Array(gridCols).fill(null));
        });
        const paddingTop = 60;
        const paddingBottom = 40;
        const getFreePosition = (zone, isBuilding = false) => {
            let attempts = 0;
            while(attempts < 50) {
                const r = randomInt(0, gridRows - 1);
                const c = randomInt(0, gridCols - 1);
                const potentialY = r * GRID_SIZE + (GRID_SIZE / 4);
                if (potentialY < paddingTop || potentialY > MAP_HEIGHT - paddingBottom) {
                    attempts++;
                    continue;
                }
                if (!zone.placementGrid[r][c]) {
                    zone.placementGrid[r][c] = isBuilding ? 'building' : 'unit'; 
                    return { 
                        x: c * GRID_SIZE + (GRID_SIZE / 4), 
                        y: potentialY
                    };
                }
                attempts++;
            }
            const safeMapHeight = MAP_HEIGHT - paddingTop - paddingBottom;
            return { 
                x: randomInt(20, MAP_WIDTH - 20), 
                y: randomInt(paddingTop, paddingTop + safeMapHeight)
            };
        };
        const totalResidents = randomInt(cityConfig.pop[0], cityConfig.pop[1]);
        const totalGuards = randomInt(cityConfig.guards[0], cityConfig.guards[1]);
        let allGuards = Array.from({ length: totalGuards }, () => {
            const statRange = ENEMY_STAT_RANGES[difficulty].guard;
            const totalStatPoints = randomInt(statRange[0], statRange[1]);
            const isFemale = rollPercentage(50);
            let guard;
            if (isFemale) {
                guard = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length-1)], distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']), '城市守軍', generateVisuals(), difficulty);
            } else {
                guard = new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length-1)], distributeStats(totalStatPoints), '城市守軍');
            }
            this.equipEnemy(guard, difficulty);
            return guard;
        });
        let allResidents = Array.from({ length: totalResidents }, () => {
            const statRange = ENEMY_STAT_RANGES[difficulty].resident;
            const isFemale = rollPercentage(50);
            if (isFemale) {
                const profession = PROFESSIONS[randomInt(0, PROFESSIONS.length - 1)];
                return new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1]), ['strength', 'agility', 'intelligence', 'luck', 'charisma']), profession, generateVisuals(), difficulty);
            } else {
                return new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1])), '男性居民');
            }
        });
        const outerGuardsCount = Math.floor(totalGuards * 0.25);
        const outerGuards = allGuards.slice(0, outerGuardsCount);
        const innerGuards = allGuards.slice(outerGuardsCount);

        if (outerGuards.length > 0) {
            const pos = getFreePosition(city.zones[0], true);
            city.zones[0].buildings.push({ 
                id: crypto.randomUUID(), type: '衛兵所', occupants: outerGuards, looted: false, resources: { food: 0, wood: 0, stone: 0 },
                scoutState: 'hidden',
                postScoutText: '',
                x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
            });
        }
        
        const innerZones = city.zones.filter(z => z.name !== '外城' && z.name !== '王城');
        
        if (innerZones.length > 0) {
            let currentGuardIndex = 0;
            while(currentGuardIndex < innerGuards.length) {
                const groupSize = randomInt(2, 3);
                const patrolTeam = innerGuards.slice(currentGuardIndex, currentGuardIndex + groupSize);
                if (patrolTeam.length > 0) {
                    const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                    const pos = getFreePosition(targetZone);
                    patrolTeam.forEach(unit => { 
                        unit.x = pos.x; 
                        unit.y = pos.y;
                        unit.scoutState = 'hidden';
                    });
                    targetZone.enemies.push(patrolTeam);
                }
                currentGuardIndex += groupSize;
            }
        }
        
        const buildingCount = Math.ceil(totalResidents / 1.5);
        if (innerZones.length > 0) {
            for (let i = 0; i < buildingCount; i++) {
                const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                const pos = getFreePosition(targetZone, true);
                targetZone.buildings.push({
                    id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                    occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                    scoutState: 'hidden',
                    postScoutText: '',
                    x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                });
            }
        }
        
        innerZones.forEach(zone => {
            while (zone.buildings.length > 0 && zone.buildings.length < 3) {
                const pos = getFreePosition(zone, true);
                zone.buildings.push({
                    id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                    occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                    scoutState: 'hidden',
                    postScoutText: '',
                    x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                });
            }
        });

        const allInnerBuildings = innerZones.flatMap(z => z.buildings);
        allResidents.forEach(resident => {
            let finalUnit = resident;
            if(rollPercentage(5)) {
                const knightStatRange = cityConfig.knightStats;
                const knightTypes = Object.keys(KNIGHT_ORDER_UNITS);
                const randomKnightType = knightTypes[randomInt(0, knightTypes.length - 1)];
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                finalUnit = rollPercentage(50) ? new FemaleKnightOrderUnit(randomKnightType, totalStatPoints, difficulty) : new KnightOrderUnit(randomKnightType, totalStatPoints);
            }

            this.equipEnemy(finalUnit, difficulty);

            if (rollPercentage(80) && allInnerBuildings.length > 0) {
                const randomBuilding = allInnerBuildings[randomInt(0, allInnerBuildings.length - 1)];
                randomBuilding.occupants.push(finalUnit);
            } else if (innerZones.length > 0) {
                // --- START OF MODIFIED CODE ---
                // 修正了此處的變數錯誤
                const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                const pos = getFreePosition(targetZone);
                finalUnit.x = pos.x;
                finalUnit.y = pos.y;
                finalUnit.scoutState = 'hidden';
                targetZone.enemies.push([finalUnit]);
                // --- END OF MODIFIED CODE ---
            }
        });
        
        const royalCityZone = city.zones.find(z => z.name === '王城');
        if (difficulty === 'hell' && royalCityZone) {
            royalCityZone.enemies = [];
            royalCityZone.buildings = [];
            let castleOccupants = [];
            const knightStatRange = cityConfig.knightStats;
            const knightTypes = Object.keys(KNIGHT_ORDER_UNITS);
            knightTypes.forEach(unitType => {
                if (!KNIGHT_ORDER_UNITS[unitType]) return;
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                const knight = rollPercentage(50) 
                    ? new FemaleKnightOrderUnit(unitType, totalStatPoints) 
                    : new KnightOrderUnit(unitType, totalStatPoints);
                castleOccupants.push(knight);
            });
            const numPrincesses = randomInt(1, 3);
            const availableNames = [...FEMALE_NAMES].sort(() => 0.5 - Math.random());
            for (let i = 0; i < numPrincesses; i++) {
                const princessName = availableNames.pop() || `公主 #${i + 1}`;
                const princessStats = {
                    strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: randomInt(150, 200)
                };
                const princess = new FemaleHuman(princessName, princessStats, '公主', generateVisuals());
                castleOccupants.push(princess);
            }
            const pos = { x: (MAP_WIDTH / 2) - (GRID_SIZE / 2), y: 100 };
            royalCityZone.buildings.push({
                id: crypto.randomUUID(), type: '城堡', occupants: castleOccupants, looted: false,
                resources: { food: 500, wood: 500, stone: 500 }, 
                scoutState: 'hidden',
                postScoutText: '', isFinalChallenge: true,
                x: pos.x, y: pos.y, width: GRID_SIZE, height: GRID_SIZE 
            });
        }
        const resConfig = {
            easy: { food: [100, 200], wood: [50, 100], stone: [50, 100] },
            normal: { food: [200, 400], wood: [100, 200], stone: [100, 200] },
            hard: { food: [400, 800], wood: [200, 400], stone: [200, 400] },
            hell: { food: [800, 1600], wood: [400, 800], stone: [400, 800] }
        };
        const totalFood = randomInt(resConfig[difficulty].food[0], resConfig[difficulty].food[1]);
        const totalWood = randomInt(resConfig[difficulty].wood[0], resConfig[difficulty].wood[1]);
        const totalStone = randomInt(resConfig[difficulty].stone[0], resConfig[difficulty].stone[1]);
        const allCityBuildings = city.zones.flatMap(z => z.buildings);
        if(allCityBuildings.length > 0) {
            for(let i = 0; i < totalFood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.food++;
            for(let i = 0; i < totalWood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.wood++;
            for(let i = 0; i < totalStone; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.stone++;
        }
        city.zones.forEach(zone => {
            zone.resources.food = zone.buildings.reduce((sum, b) => sum + b.resources.food, 0);
            zone.resources.wood = zone.buildings.reduce((sum, b) => sum + b.resources.wood, 0);
            zone.resources.stone = zone.buildings.reduce((sum, b) => sum + b.resources.stone, 0);
        });

        return city;
    },
    enterThroneRoom(units) {
        this.logMessage('raid', '你推開城堡沉重的大門，踏入了決定命運的「王座之間」！', 'system');
        this.throneRoomUnits = units;

        this.screen = 'throne_room';
    },

    scoutThroneUnit(unit) {
        this.modals.throneScout.unit = unit;
        this.modals.throneScout.isOpen = true;
    },

    getThroneUnitDialogue(unit) {
        if (!unit) return '';
        const dialogues = {
            '公主': '「汝，為哥布林之王？竟敢踏足此地！」',
            '士兵': '「以王國之名，我將斬殺你的野望！」',
            '盾兵': '「這面盾牌將是你無法逾越的絕壁！」',
            '槍兵': '「看來你運氣不太好呀...長槍將貫穿你的野心！」',
            '弓兵': '「你無處可逃！箭矢將終結你！」',
            '騎士': '「為了公主與王國的榮耀，我將在此斬除邪惡！」',
            '法師': '「感受元素的憤怒吧，卑劣的生物！」',
            '祭司': '「汙穢的生物，面對你的罪行吧！」'
        };
        return dialogues[unit.profession] || '「......」';
    },

    startFinalBattle() {
        this.logMessage('raid', '最終決戰的號角響起！', 'enemy');
        this.modals.throneScout.isOpen = false;
        this.startCombat(this.throneRoomUnits, true);
    },

    scoutEnvironment() {
        // 這是完全重寫的函式，實現「解除迷霧」的功能
        const playerPartySize = [this.player, ...this.player.party].length;
        const zone = this.currentRaid.currentZone;

        // 1. 找出所有還隱藏的目標
        const hiddenBuildings = zone.buildings.filter(b => b.scoutState === 'hidden');
        const hiddenEnemies = zone.enemies
            .filter(group => group.length > 0 && group[0].scoutState === 'hidden');
        
        let availableTargets = [...hiddenBuildings, ...hiddenEnemies];

        if (availableTargets.length === 0) {
            this.logMessage('raid', '你已經將此區域偵查完畢，沒有新的發現。', 'info');
            return;
        }

        // 2. 根據隊伍人數決定要揭露多少目標
        const targetsToRevealCount = Math.min(playerPartySize, availableTargets.length);
        this.currentRaid.timeRemaining -= 2;
        this.logMessage('raid', `你開始仔細偵查周遭環境，尋找目標... (-2 分鐘)`, 'info');

        const revealedTargetNames = [];

        // 3. 隨機揭露目標
        for (let i = 0; i < targetsToRevealCount; i++) {
            const randomIndex = randomInt(0, availableTargets.length - 1);
            const [targetToReveal] = availableTargets.splice(randomIndex, 1);

            let targetName = '';
            if (Array.isArray(targetToReveal)) { // 這是敵人隊伍
                const representativeEnemy = targetToReveal[0];
                // 將整個隊伍所有人的狀態都設為 revealed
                targetToReveal.forEach(unit => unit.scoutState = 'revealed');
                targetName = `一支由 ${representativeEnemy.name} 帶領的隊伍`;
            } else { // 這是建築
                targetToReveal.scoutState = 'revealed';
                targetName = `一棟 ${targetToReveal.type}`;
            }
            revealedTargetNames.push(targetName);
        }

        // 4. 記錄日誌並檢查時間
        if (revealedTargetNames.length > 0) {
            this.logMessage('raid', `偵查成功！你們發現了 ${revealedTargetNames.join('、')} 的位置。`, 'success');
            // 強制刷新UI
            this.currentRaid.currentZone = { ...this.currentRaid.currentZone };
        }
        
        this.checkRaidTime();
    },
   
    scoutTarget(targetOrGroup) {
        if (!targetOrGroup || (Array.isArray(targetOrGroup) && targetOrGroup.length === 0)) {
            this.showCustomAlert("偵查目標無效！");
            return;
        }
        const isGroup = Array.isArray(targetOrGroup);
        const representativeTarget = isGroup ? targetOrGroup[0] : targetOrGroup;
        const targetNameForLog = isGroup ? '一個隊伍' : (representativeTarget.type || representativeTarget.name);
        
        // 新增：如果目標已經被詳細偵查過，直接顯示情報且不耗時
        if (representativeTarget.scoutState === 'scouted') {
            this.modals.scoutInfo.target = isGroup ? targetOrGroup : (representativeTarget.occupants || []);
            this.modals.scoutInfo.emptyBuildingMessage = representativeTarget.looted ? '這棟建築是空的，你已搜刮過。' : '這棟建築是空的，看來可以搜刮一番。';
            this.modals.scoutInfo.isOpen = true;
            this.logMessage('raid', `你再次查看了 ${targetNameForLog} 的情報。`, 'info');
            return;
        }
        
        // 偵查空建築的邏輯
        if (!isGroup && representativeTarget.occupants && representativeTarget.occupants.length === 0) {
            this.currentRaid.timeRemaining -= 2;
            this.logMessage('raid', `偵查成功！你發現 ${targetNameForLog} 是空的。(-2 分鐘)`, 'success');
            
            representativeTarget.scoutState = 'scouted'; // 更新為已偵查狀態
            this.updateBuildingScoutText(); // 更新建築狀態文字
            
            this.modals.scoutInfo.target = [];
            this.modals.scoutInfo.emptyBuildingMessage = representativeTarget.looted ? '這棟建築是空的，你已搜刮過。' : '這棟建築是空的，看來可以搜刮一番。';
            this.modals.scoutInfo.isOpen = true;
            this.checkRaidTime();
            return;
        }

        // 偵查有人目標的擲骰邏輯
        const playerParty = [this.player, ...this.player.party];
        const enemiesToScout = isGroup ? targetOrGroup : representativeTarget.occupants;
        const contestResult = this.performAbilityContest(playerParty, enemiesToScout);

        this.logMessage('raid', `我方偵查擲骰: ${contestResult.partyA_Details.roll} (基於 ${contestResult.partyA_Details.diceCount}d10) + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('raid', `敵方隱蔽擲骰: ${contestResult.partyB_Details.roll} (基於 ${contestResult.partyB_Details.diceCount}d10) + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');

        if (contestResult.partyA_Value > contestResult.partyB_Value) { 
            this.currentRaid.timeRemaining -= 2;
            
            if (isGroup) {
                targetOrGroup.forEach(unit => unit.scoutState = 'scouted');
            } else {
                representativeTarget.scoutState = 'scouted';
            }
            this.updateBuildingScoutText(); // 更新建築狀態文字

            this.logMessage('raid', `你成功偵查了 ${targetNameForLog} 的詳細情報！(-2 分鐘)`, 'success');
            this.modals.scoutInfo.target = enemiesToScout;
            this.modals.scoutInfo.isOpen = true;
        } else {
            this.currentRaid.timeRemaining -= 4;
            this.logMessage('raid', `偵查 ${targetNameForLog} 失敗！(-4 分鐘)`, 'enemy');
        }
        this.checkRaidTime();
    },

    lootBuilding(building) {
        if(building.looted) return;

        // --- 搜刮建築的前置檢查 (邏輯不變) ---
        const zone = this.currentRaid.currentZone;
        const isInnerCity = zone.name.includes('內城') || zone.name === '王城';
        const patrolsExist = zone.enemies && zone.enemies.length > 0;
        if (isInnerCity && patrolsExist) {
            const patrolGroupCount = zone.enemies.length;
            const totalBuildingCount = zone.buildings.length;
            if (totalBuildingCount > 0) {
                const discoveryChance = (patrolGroupCount / (totalBuildingCount * 4)) * 100;
                if (rollPercentage(discoveryChance)) {
                    this.logMessage('raid', `你搜刮 ${building.type} 的聲音太大，驚動了附近的一支巡邏隊！`, 'enemy');
                    const patrolToFight = zone.enemies[randomInt(0, patrolGroupCount - 1)];
                    this.startCombat(patrolToFight, true);
                    return; 
                }
            }
        }

        // --- 搜刮資源的核心邏輯 (邏輯不變) ---
        this.currentRaid.timeRemaining -= 3;
        let foodFound = building.resources.food;
        let woodFound = building.resources.wood;
        let stoneFound = building.resources.stone;

        const deepScavengingId = 'raid_deep_scavenging';
        if (this.player && this.player.learnedSkills[deepScavengingId]) {
            const skillLevel = this.player.learnedSkills[deepScavengingId];
            const skillData = SKILL_TREES.raiding.find(s => s.id === deepScavengingId);
            const multiplier = skillData.levels[skillLevel - 1].effect.multiplier;
            foodFound = Math.floor(foodFound * multiplier);
            woodFound = Math.floor(woodFound * multiplier);
            stoneFound = Math.floor(stoneFound * multiplier);
        }
        
        this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodFound);
        this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodFound);
        this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneFound);

        building.looted = true;
        building.postScoutText = ' (空)';
        building.resources = { food: 0, wood: 0, stone: 0 };
        
        this.currentRaid.currentZone.resources.food -= foodFound;
        this.currentRaid.currentZone.resources.wood -= woodFound;
        this.currentRaid.currentZone.resources.stone -= stoneFound;
        
        this.logMessage('raid', `搜刮了 ${building.type} (-3 分鐘)，找到食物 ${foodFound}, 木材 ${woodFound}, 礦石 ${stoneFound}。`, 'success');
        
        // --- 【核心修改】呼叫統一的戰利品生成函式 ---
        this._generateAndAwardLoot({
            baseDropRate: 20, // 建築搜刮的基礎掉落率是 20%
            possibleQualities: ['common', 'uncommon'], // 固定掉落 普通/精良 品質
            difficulty: this.currentRaid.difficulty,
            sourceName: `a looted ${building.type}`
        });
        
        // --- 技能與時間檢查 (邏輯不變) ---
        const reappearingAuthId = 'raid_reappearing_authority';
        if (this.player && this.player.learnedSkills[reappearingAuthId]) {
            const skillData = SKILL_TREES.raiding.find(s => s.id === reappearingAuthId);
            if (rollPercentage(skillData.levels[0].effect.chance * 100)) {
                building.looted = false;
                building.postScoutText = ' (可再次搜刮)';
                this.logMessage('raid', `在「重現的權能」影響下，${building.type} 內的資源似乎又重新出現了！`, 'crit');
            }
        }
            
        this.checkRaidTime();
    },

    canAdvance() {
        if (this.currentRaid && this.currentRaid.currentZone.name === '王城') {
            const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
            // 只有在城堡被偵查後，才允許前進
            return castle && castle.scouted;
        }
        return this.currentRaid && this.currentRaid.currentZoneIndex < this.currentRaid.zones.length - 1 && this.currentRaid.currentZone.enemies.flat().filter(e => e.profession === '城市守軍').length === 0 && this.currentRaid.currentZone.buildings.every(b => b.occupants.filter(o => o.profession === '城市守軍').length === 0);
    },
    advanceToNextZone(force = false) {
        const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
        if (this.currentRaid.currentZone.name === '王城' && castle && castle.scouted) {
            // 呼叫新函數，而不是移動到下一個zone
            this.enterThroneRoom(castle.occupants);
            return;
        }
        if (!this.canAdvance() && !force) {
            this.showCustomAlert('必須先清除此區域的守軍才能前進！');
            return;
        }
        this.currentRaid.timeRemaining -= 5;
        this.currentRaid.currentZoneIndex++;
        this.logMessage('raid', `你深入到了 ${this.currentRaid.currentZone.name}。(-5 分鐘)`, 'player');
    },

    sneakPastGuards() {
        if (!this.currentRaid || this.currentRaid.currentZoneIndex !== 0) return;
        const guardPost = this.currentRaid.currentZone.buildings.find(b => b.type === '衛兵所');
        if (!guardPost || guardPost.occupants.length === 0) {
            this.showCustomAlert('外城沒有守軍可以繞過。');
            return;
        }

        const outerGuards = guardPost.occupants;
        const playerAgility = this.player.getTotalStat('agility', this.isStarving);
        const enemyAvgAgility = outerGuards.reduce((sum, e) => sum + e.stats.agility, 0) / outerGuards.length;
        
        let penalty = ((this.player.party.length + 1) - outerGuards.length) * 2;
        if (penalty > 0) {
            const skillId = 'raid_dispersed_escape';
            if (this.player && this.player.learnedSkills[skillId]) {
                const skillLevel = this.player.learnedSkills[skillId];
                const skillData = SKILL_TREES.raiding.find(s => s.id === skillId);
                const reduction = skillData.levels[skillLevel - 1].effect.penalty_reduction;
                penalty *= (1 - reduction);
            }
        }

        const successChance = 50 + (playerAgility - enemyAvgAgility) * 1.5 - penalty;

        if (rollPercentage(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行成功！你花費了 3 分鐘，悄悄地繞過了守軍。`, 'success');
            this.advanceToNextZone(true);
            this.checkRaidTime();
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `潛行失敗！你被守軍發現了！(-6 分鐘)`, 'enemy');
            // 將舊的 isTargetScouted 判斷式，改為使用新的 scoutState 系統
            this.startCombat(outerGuards, guardPost.scoutState !== 'scouted');
            this.checkRaidTime();
        }
    },

    handleRetreatAction() {
        if (!this.currentRaid) return;

        if (this.currentRaid.currentZoneIndex === 0) {
            
            const baseCost = 5;
            const captiveCost = (this.currentRaid.carriedCaptives.length || 0) * 5;
            const totalCost = baseCost + captiveCost;
            
            this.currentRaid.timeRemaining -= totalCost;
            
            this.logMessage('raid', `你帶著 ${this.currentRaid.carriedCaptives.length} 名俘虜脫離城鎮，花費了 ${totalCost} 分鐘。`, 'player');
            
            this.isRetreatingWhenTimeExpired = true; // 在檢查時間前，標記為正在脫離
            this.checkRaidTime(); 
            
            if (this.currentRaid && this.currentRaid.timeRemaining > 0) {
                this.prepareToEndRaid();
            }
            
        } else {
            // 否則，撤退回上一層区域
            const oldZoneName = this.currentRaid.currentZone.name;
            this.currentRaid.currentZoneIndex--; // 區域索引減 1
            this.currentRaid.timeRemaining -= 5; // 消耗 5 分鐘
            const newZoneName = this.currentRaid.currentZone.name;
            
            this.logMessage('raid', `你從 ${oldZoneName} 撤退回了 ${newZoneName}。(-5 分鐘)`, 'player');
            this.checkRaidTime(); // 檢查時間是否耗盡
        }
    },
    prepareToEndRaid(wasDefeated = false) {
        if (wasDefeated) {
            this.endRaid(true); // 如果是戰敗，直接跳到結束流程
            return;
        }
        
        const newCaptives = this.currentRaid.carriedCaptives;
        const currentDungeonCaptives = this.dungeonCaptives;

        // 當地牢的現有人 + 新抓的人 > 地牢容量時
        if (currentDungeonCaptives.length + newCaptives.length > this.captiveCapacity) {
            
            this.logMessage('tribe', '你帶回的俘虜過多，地牢無法容納！你需要從現有和新增的俘虜中決定去留...', 'warning');

            //  只將「原地牢俘虜」和「新抓的俘虜」放入選擇列表
            this.openCaptiveManagementModal(
                'raid_return', // 使用一個新的類型來區分這個特殊情境
                [...currentDungeonCaptives, ...newCaptives],
                this.captiveCapacity // 上限為地牢的容量
            );
        } else {
            // 容量充足，直接結束掠奪
            this.endRaid(false);
        }
    },
    endRaid(wasDefeated = false) {
        if (this.tutorial.active) {
            if(this.currentRaid.carriedCaptives.length > 0) {
                this.advanceTutorial(6);
            } else {
                this.tutorial.active = false;
                this.tutorial.step = 0;
                this.showCustomAlert('王，您平安歸來了。雖然這次沒有戰利品，但您已熟悉了流程。接下來，請自由探索這個世界吧！');
            }
        }

        if (!wasDefeated) {
            this.captives.push(...this.currentRaid.carriedCaptives);
            this.logMessage('tribe', `你帶回了 ${this.currentRaid.carriedCaptives.length} 名俘虜。`, 'player');
        }
        
        this.currentRaid = null;
        // 重置掠奪地圖上被選中的目標
        this.selectedTarget = null; 
        
        this.screen = 'tribe';
        
        this.player.currentHp = this.player.maxHp;
        this.partners.forEach(p => p.currentHp = p.maxHp);
        this.logMessage('tribe', '所有夥伴的生命值都已完全恢復。', 'success');

        this.finalizeRaidReturn();
    },
    finalizeRaidReturn() {
        this.currentRaid = null;
        this.screen = 'tribe';
        
        // 恢復所有單位生命值
        this.player.currentHp = this.player.maxHp;
        this.partners.forEach(p => p.currentHp = p.maxHp);
        this.logMessage('tribe', '所有夥伴的生命值都已完全恢復。', 'success');

        // --- 在換日之前，先檢查新生兒是否會導致寢室溢出 ---
        const newborns = this.postBattleBirths.map(b => b.newborn);
        if (this.postBattleBirths.length > 0 && (this.partners.length + newborns.length) > this.partnerCapacity) {
            // 如果會溢出，則先不換日，而是彈出決策視窗
            this.logMessage('tribe', `有 ${newborns.length} 個新生命誕生了，但寢室已滿！您需要做出選擇...`, 'warning');
            this.pendingDecisions.push({
                type: 'partner',
                list: [...this.partners, ...newborns],
                limit: this.partnerCapacity,
                // 添加一個標記，告訴後續函式這個決策來自掠奪回歸
                context: { newborns: this.postBattleBirths, fromRaidReturn: true } 
            });
            this.checkAndProcessDecisions(); // 立即處理並顯示彈窗
        } else {
            // 如果寢室容量足夠，則正常換日
            this.nextDay();
        }
    },

    checkRaidTime() {
        // 如果當前已經在打支援騎士團之戰了，就直接停止任何時間檢查，避免重複觸發
        if (this.combat.isReinforcementBattle) {
            return;
        }

        if (this.currentRaid && this.currentRaid.timeRemaining <= 0) {
            if (this.screen === 'combat') {
                this.raidTimeExpired = true;
            } else if (!this.currentRaid.reinforcementsDefeated) {
                this.triggerReinforcementBattle();
            }
        }
    },

    executeSneakKidnapFromModal() {
        if (!this.modals.scoutInfo.target || !Array.isArray(this.modals.scoutInfo.target)) return;

        const group = this.modals.scoutInfo.target;
        // 找到群組中第一位活著的女性作為目標
        const targetFemale = group.find(unit => unit.visual && unit.isAlive());

        if (targetFemale) {
            // 檢查是否已對此目標潛行失敗過
            if (this.currentRaid.failedSneakTargets.has(targetFemale.id)) {
                this.showCustomAlert(`你已經對 ${targetFemale.name} 潛行失敗過一次，再次嘗試會被直接發現！`);
                return;
            }
            this.modals.scoutInfo.isOpen = false; // 執行前關閉視窗
            this.selectedTarget = null;
            this.sneakKidnap(targetFemale, group); // 呼叫核心潛行邏輯
        } else {
            this.showCustomAlert('找不到可下手的目標。');
        }
    },

    executeSneakKidnapFromMap() {
        if (!this.selectedTarget || !Array.isArray(this.selectedTarget)) return;

        const group = this.selectedTarget;
        const targetFemale = group.find(unit => unit.visual && unit.isAlive());

        if (targetFemale) {
            if (this.currentRaid.failedSneakTargets.has(targetFemale.id)) {
                this.showCustomAlert(`你已經對 ${targetFemale.name} 潛行失敗過一次，再次嘗試會被直接發現！`);
                return;
            }
            this.selectedTarget = null; // 執行前清除選取，隱藏選單
            this.sneakKidnap(targetFemale, group);
        } else {
            // 這個訊息理論上不會出現，因為按鈕的 x-show 已經過濾掉了
            this.showCustomAlert('該隊伍中沒有可下手的目標。');
        }
    },

    // 觸發騎士團增援戰
    triggerReinforcementBattle() {
        if (!this.currentRaid || this.currentRaid.reinforcementsDefeated) {
            return; // 如果沒有掠奪，或者增援已經被打敗過，則直接中斷函式，不執行任何操作
        }

        this.logMessage('raid', '時間已到！王國騎士團的增援部隊抵達了城鎮！', 'enemy');

        // 根據 GDD 6.3 規則生成騎士團隊伍
        const difficulty = this.currentRaid.difficulty;
        let knightSquad = [];
        const squadComposition = {
            easy:   { '士兵': 3, '盾兵': 2 },
            normal: { '士兵': 4, '盾兵': 3, '槍兵': 2, '弓兵': 1 },
            hard:   { '士兵': 5, '盾兵': 3, '槍兵': 3, '弓兵': 2, '騎士': 1, '法師': 1 },
            hell:   { '士兵': 6, '盾兵': 4, '槍兵': 4, '弓兵': 2, '騎士': 2, '法師': 1, '祭司': 1 }
        };
        const knightStatRanges = {
            easy: [65, 120],
            normal: [120, 190],
            hard: [190, 280],
            hell: [280, 360]
        };

        const composition = squadComposition[difficulty];
        const statRange = knightStatRanges[difficulty];

        if (composition) {
            for (const unitType in composition) {
                for (let i = 0; i < composition[unitType]; i++) {
                    const totalStatPoints = randomInt(statRange[0], statRange[1]);
                    let knight;
                    if (rollPercentage(50)) {
                        knight = new FemaleKnightOrderUnit(unitType, totalStatPoints);
                    } else {
                        knight = new KnightOrderUnit(unitType, totalStatPoints);
                    }
                    this.equipEnemy(knight, difficulty);
                    knightSquad.push(knight);
                }
            }
        }
        
        // 標記這是一場無法逃脫的增援戰
        this.combat.isReinforcementBattle = true; 
        
        // 開始戰鬥，設定敵人先攻
        this.startCombat(knightSquad, true); 
    },

    async sneakKidnap(target, group) {
        const femalesInGroup = group.filter(unit => unit.visual && unit.isAlive());
        if (femalesInGroup.length === 0) {
            this.showCustomAlert('該隊伍中沒有可下手的目標。');
            return;
        }

        const primaryTarget = femalesInGroup[0];
        if (this.currentRaid.failedSneakTargets.has(primaryTarget.id)) {
            this.showCustomAlert(`你已經對 ${primaryTarget.name} 所在的隊伍潛行失敗過，再次嘗試會被直接發現！`);
            this.startCombat(group, true);
            return;
        }

        const playerParty = [this.player, ...this.player.party];
        const contestResult = this.performAbilityContest(playerParty, group);

        await this.showDiceRollAnimation('潛行擄走判定', 
            contestResult.partyA_Details.rolls.map(r => ({ sides: contestResult.partyA_Details.sides, result: r })), 
            contestResult.partyB_Details.rolls.map(r => ({ sides: contestResult.partyB_Details.sides, result: r }))
        );

        this.logMessage('raid', `我方潛行擲骰: ${contestResult.partyA_Value - contestResult.partyA_Details.partySize} + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('raid', `敵方警覺擲骰: ${contestResult.partyB_Value - contestResult.partyB_Details.partySize} + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');

        if (contestResult.partyA_Value > contestResult.partyB_Value) {
            // ... 成功邏輯維持不變 ...
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行成功！你將 ${femalesInGroup.map(f => f.name).join('、')} 全部擄走！(-3 分鐘)`, 'success');
            femalesInGroup.forEach(femaleUnit => {
                const newCaptive = new FemaleHuman(femaleUnit.name, femaleUnit.stats, femaleUnit.profession, femaleUnit.visual, femaleUnit.originDifficulty);
                newCaptive.maxHp = newCaptive.calculateMaxHp();
                newCaptive.currentHp = newCaptive.maxHp;
                this.addCaptiveToCarry(newCaptive);
                this.gainResourcesFromEnemy(femaleUnit);
                this.removeUnitFromRaidZone(femaleUnit.id);
            });
            this.updateBuildingScoutText();
            this.checkRaidTime();
        } else {
            // ... 失敗邏輯維持不變 ...
            this.currentRaid.timeRemaining -= 6;
            femalesInGroup.forEach(f => this.currentRaid.failedSneakTargets.add(f.id));
            this.logMessage('raid', `潛行擄走 ${primaryTarget.name} 失敗，你被整個隊伍發現了！(-6 分鐘)`, 'enemy');
            this.startCombat(group, true);
            this.checkRaidTime();
        }
    },

    startCombat(enemyGroup, enemyFirstStrike = false, alliesOverride = null) {
        this.resetAllSkillCooldowns();

        // 在戰鬥開始時，為特殊 Boss 加上對話觸發旗標
        enemyGroup.forEach(enemy => {
            if (enemy instanceof ApostleMaiden || enemy instanceof SpiralGoddess) {
                enemy.triggeredDialogues = new Set();
            }
        });

        let combatAllies;

        // 檢查這是否為一場部落保衛戰 (非掠奪期間的戰鬥)
        if (!this.currentRaid) {
            // 是保衛戰：集結所有「未被派遣」的夥伴
            const dispatchedIds = new Set([
                ...this.dispatch.hunting,
                ...this.dispatch.logging,
                ...this.dispatch.mining
            ]);
            const availablePartners = this.partners.filter(p => !dispatchedIds.has(p.id));
            combatAllies = [this.player, ...availablePartners];
            this.logMessage('tribe', `部落全員動員，抵禦入侵者！`, 'system');
        } else {
            // 是掠奪戰：使用玩家手動設定的出擊隊伍
            combatAllies = [this.player, ...this.player.party];
        }

        this.combat.allies = (alliesOverride || combatAllies).filter(u => u.isAlive());
        this.combat.enemies = enemyGroup.filter(u => u.isAlive());
        this.combat.currentEnemyGroup = enemyGroup;
        this.combat.turn = 1;
        this.combat.isProcessing = false;
        this.combat.playerActionTaken = false;
        this.screen = 'combat';
        this.logs.combat = [];
        this.logMessage('combat', `戰鬥開始！`, 'system');
        
        if (enemyFirstStrike) {
            this.logMessage('combat', '敵人發動了突襲！', 'enemy');
            this.executeTurn(true); 
        } else {
            this.logMessage('combat', '等待你的指令...', 'system');
        }
        if (enemyGroup[0] instanceof SpiralGoddess) {
            this.startGoddessQnA();
        }
    },

    // 1：負責顯示UI並“等待”玩家回答
    promptGoddessQuestionAndWaitForAnswer() {
        return new Promise(resolve => {
            const goddess = this.combat.enemies[0];
            const qnaData = SPECIAL_BOSSES.spiral_goddess_mother.qna;

            if (goddess.qnaIndex < qnaData.length) {
                this.combat.isGoddessQnA = true;
                this.combat.goddessQuestion = qnaData[goddess.qnaIndex].question;
                this.combat.playerAnswer = '';
                
                // 將 resolve 函式暫存起來，供 submitGoddessAnswer 呼叫
                this.combat.resolveGoddessAnswer = resolve; 
            } else {
                // 如果問題已問完，直接 resolve 一個特殊標記
                resolve({ finished: true });
            }
        });
    },

    // 2：負責在玩家點擊按鈕後“提交”答案
    submitGoddessAnswer() {
        if (this.combat.isGoddessQnA && typeof this.combat.resolveGoddessAnswer === 'function') {
            this.combat.isGoddessQnA = false; // 關閉輸入介面
            // 呼叫之前暫存的 resolve，將玩家的答案傳回給正在等待的 processAiAction 函式
            this.combat.resolveGoddessAnswer({ answer: this.combat.playerAnswer });
            this.combat.resolveGoddessAnswer = null; // 清理
        }
    },

    resetAllSkillCooldowns() {
        if (!this.player || !this.player.skills) return;
        this.player.skills.forEach(skillInstance => {
            skillInstance.currentCooldown = 0;
        });
    },

    async useSkill(skillId) {
        if (this.combat.isProcessing || this.combat.playerActionTaken) return;
        
        const skillData = this.learnedActiveSkills.find(s => s.id === skillId);
        if (!skillData || skillData.currentCooldown > 0) {
            this.showCustomAlert('技能尚未冷卻或無法使用！');
            return;
        }
        
        this.combat.playerActionTaken = true;
        this.modals.combatSkills.isOpen = false;
        this.logMessage('combat', `${this.player.name} 施放了技能 [${skillData.name}]！`, 'skill');

        // 1. 立即設定技能冷卻
        const playerSkillInstance = this.player.skills.find(s => s.id === skillId);
        if (playerSkillInstance) {
            playerSkillInstance.currentCooldown = this.player.getFinalCooldown(skillData);
        }

        // 2. 檢查「歸零的權能」
        const zeroAuthId = 'combat_zero_authority';
        if (this.player && this.player.learnedSkills[zeroAuthId] && playerSkillInstance) {
            const zeroAuthData = SKILL_TREES.combat.find(s => s.id === zeroAuthId);
            if (rollPercentage(zeroAuthData.levels[0].effect.chance * 100)) {
                playerSkillInstance.currentCooldown = 0;
                this.logMessage('combat', `「歸零的權能」觸發！[${skillData.name}] 的冷卻時間被立即清除了！`, 'crit');
            }
        }

        // 3. 判斷是否為屬性攻擊技能，並立即執行攻擊
        const strikeSkills = ['combat_powerful_strike', 'combat_agile_strike', 'combat_enchanted_strike', 'combat_lucky_strike'];
        if (strikeSkills.includes(skillId)) {
            const skillLevel = this.player.learnedSkills[skillId];
            const effect = skillData.levels[skillLevel - 1].effect;
            
            // 設定一次性的 buff，供 calculateDamage 函式使用
            this.player.activeSkillBuff = {
                id: skillId,
                multiplier: effect.multiplier,
                stat: effect.stat || 'strength'
            };

            // 立即對隨機敵人發動攻擊
            const livingEnemies = this.combat.enemies.filter(t => t.isAlive());
            if (livingEnemies.length > 0) {
                const target = livingEnemies[randomInt(0, livingEnemies.length - 1)];
                await this.processAttack(this.player, target);
            }
        } 
        // 未來其他主動技能的 'else if' 邏輯可以加在這裡

        // 4. 技能施放完畢，輪到敵人行動
        if (this.combat.enemies.filter(e => e.isAlive()).length > 0) {
            await this.executeTurn(false);
        } else {
            // 如果敵人全滅，直接結束戰鬥
            this.endCombat(true);
        }
    },

    async executePlayerAction(action) {
        if (this.combat.isProcessing || this.combat.playerActionTaken || !this.player || !this.player.isAlive()) return;
        this.combat.playerActionTaken = true;

        let continueToEnemyTurn = true;

        if (action === 'attack') {
            if (this.player.activeSkillBuff?.id === 'combat_powerful_strike') {
                this.logMessage('combat', `[強力一擊] 效果觸發！`, 'crit');
            }
            const livingEnemies = this.combat.enemies.filter(t => t.isAlive());
            if (livingEnemies.length > 0) {
                const target = livingEnemies[randomInt(0, livingEnemies.length - 1)];
                await this.processAttack(this.player, target, false);
            }
        } else if (action === 'escape') {
            const result = await this.attemptSneakEscape();
            if (result === 'escaped') {
                continueToEnemyTurn = false;
            }
        }

        if (continueToEnemyTurn && this.combat.enemies.filter(e => e.isAlive()).length > 0) {
            this.executeTurn(false);
        } else if (!continueToEnemyTurn) {

        } else {
            this.endCombat(true);
        }
    },

    async executeTurn(isEnemyFirstStrike = false) {
        if (this.combat.isGoddessQnA) {
            this.combat.isProcessing = false;
            return; // 如果是問答階段，則跳過所有戰鬥流程
        }
        if (this.combat.isProcessing) return;
        this.combat.isProcessing = true;

        if (this.combat.turn > 15) {
            const oldestTurnToKeep = this.combat.turn - 15;
            this.logs.combat = this.logs.combat.filter(entry => entry.turn >= oldestTurnToKeep);
        }
        
        // 將消耗時間的邏輯包裹在條件判斷中
        if (this.currentRaid) {
            // 如果是在掠奪中，才消耗時間並顯示倒數
            this.currentRaid.timeRemaining--;
            this.checkRaidTime();
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 (-1 分鐘) ---`, 'system');
        } else {
            // 如果不是在掠奪中 (例如部落防衛戰)，則不消耗時間
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 ---`, 'system');
        }

        const livingEnemies = this.combat.enemies.filter(e => e.isAlive());
        for (const unit of livingEnemies) {
            if (!unit.isAlive()) continue;
            await this.processAiAction(unit);
        }
        
        await new Promise(res => setTimeout(res, 200));

        if (!isEnemyFirstStrike) {
            const livingPartners = this.combat.allies.filter(p => p.id !== this.player.id && p.isAlive());
            for (const unit of livingPartners) {
                    if (!unit.isAlive()) continue;
                    await this.processAiAction(unit);
            }
        }
        this.tickStatusEffects();
        [...this.combat.allies, ...this.combat.enemies].forEach(u => u.tickCooldowns());

        const livingAlliesCount = this.combat.allies.filter(u => u.isAlive()).length;
        const livingEnemiesCount = this.combat.enemies.filter(u => u.isAlive()).length;

        if (livingAlliesCount === 0) {
            this.logMessage('combat', `戰鬥失敗... 你的隊伍被全滅了。`, 'enemy');
            this.endCombat(false);
        } else if (livingEnemiesCount === 0) {
            this.logMessage('combat', `戰鬥勝利！`, 'success');
            this.endCombat(true);
        } else { // Battle continues
            this.combat.turn++;
            this.combat.isProcessing = false;

            // 檢查哥布林王是否存活
            if (!this.player.isAlive()) {
                // 王陣亡，但夥伴還在，觸發自動戰鬥
                this.logMessage('combat', '哥布林王倒下了！夥伴們將繼續戰鬥！', 'system');
                // 遲後後自動進入下一回合
                setTimeout(() => this.executeTurn(false), 1500); // 延遲1.5秒讓玩家閱讀戰報
            } else {
                // 王還活著，恢復正常流程，等待玩家指令
                this.combat.playerActionTaken = false;
                this.logMessage('combat', '等待你的指令...', 'system');
            }
        }
    },

    async processAiAction(attacker) {
        // --- 女神專屬AI邏輯 (V3) ---
        if (attacker instanceof SpiralGoddess) {
            // --- 階段一：問答 ---
            if (attacker.phase === 1) {
                const result = await this.promptGoddessQuestionAndWaitForAnswer();
                if (!result.finished) {
                    const playerNumericAnswer = parseInt(result.answer.trim());
                    const qnaData = SPECIAL_BOSSES.spiral_goddess_mother.qna;
                    const currentQnA = qnaData[attacker.qnaIndex];
                    let correctAnswer;
                    switch (currentQnA.check) {
                        case 'playerHeight': correctAnswer = this.player.height; break;
                        case 'partnerCount': correctAnswer = this.partners.length; break;
                        case 'penisSize':   correctAnswer = this.player.penisSize; break;
                        case 'captiveCount': correctAnswer = this.captives.length; break;
                        default: correctAnswer = -999; break;
                    }

                    if (!isNaN(playerNumericAnswer) && playerNumericAnswer === correctAnswer) {
                        this.logMessage('combat', `你回答了：「${playerNumericAnswer}」。女神點了點頭。`, 'player');
                    } else {
                        const penaltyDamage = correctAnswer * 10;
                        await this.showCustomAlert(
                            `女神：「謊言...是沒有意義的。」`,
                            async () => {
                                this.logMessage('combat', `你回答了：「${playerNumericAnswer || '無效的回答'}」。女神對你的謊言降下懲罰！(正確答案: ${correctAnswer})`, 'enemy');
                                await this.processAttack(attacker, this.player, false, penaltyDamage);
                            }
                        );
                    }
                    attacker.qnaIndex++;
                }

                if (attacker.qnaIndex >= SPECIAL_BOSSES.spiral_goddess_mother.qna.length && !attacker.phase2_triggered) {
                    attacker.phase2_triggered = true;
                    attacker.phase = 2; 
                    this.logMessage('combat', '問答的試煉結束了...女神的氣息改變了！', 'system');
                    this.logMessage('combat', `女神：「${SPECIAL_BOSSES.spiral_goddess_mother.dialogues.phase2_start}」`, 'enemy');
                    this.combat.allies.forEach(ally => {
                        ally.statusEffects.push({ type: 'root_debuff', duration: Infinity });
                        ally.updateHp(this.isStarving); 
                    });
                    this.logMessage('combat', '我方全體感受到了靈魂深處的撕裂，生命力的根源被削弱了！', 'player');
                }
            } 
            // --- 階段二：根源的試煉 ---
            else if (attacker.phase === 2) {
                const target = this.combat.allies.filter(a => a.isAlive())[0];
                if (target) await this.processAttack(attacker, target);
            }
            // --- 階段三：女體化的試煉 ---
            else if (attacker.phase === 3) {
                const repulsionSkillData = SPECIAL_BOSSES.spiral_goddess_mother.skills.find(s => s.id === 'goddess_repulsion');
                let skillToUse = attacker.skills.find(s => s.id === 'goddess_repulsion');
                if (!skillToUse) {
                    skillToUse = { ...repulsionSkillData, currentCooldown: 0 };
                    attacker.skills.push(skillToUse);
                }
                if (skillToUse.currentCooldown === 0) {
                    this.logMessage('combat', `女神施放了 <span class="text-pink-400">[${skillToUse.name}]</span>！`, 'skill');
                    skillToUse.currentCooldown = skillToUse.baseCooldown;
                    for (const ally of this.combat.allies.filter(a => a.isAlive())) {
                        const charismaDamage = ally.getTotalStat('charisma', this.isStarving);
                        ally.currentHp = Math.max(0, ally.currentHp - charismaDamage);
                        this.logMessage('combat', `奇異的力量在你體內奔流，對 ${ally.name} 造成了 ${charismaDamage} 點真實傷害！`, 'player');
                    }
                } else {
                    const target = this.combat.allies.filter(a => a.isAlive())[0];
                    if (target) await this.processAttack(attacker, target);
                }
            }
            // --- 階段四 & 階段五：普通攻擊 ---
            else if (attacker.phase === 4 || attacker.phase === 5) {
                const target = this.combat.allies.filter(a => a.isAlive())[0];
                if (target) await this.processAttack(attacker, target);
            }
            return; 
        }

        // 使徒AI
        if (attacker.profession === '使徒') {
            const proliferateSkill = attacker.skills.find(s => s.id === 'apostle_proliferate');
            const apostleCount = this.combat.enemies.filter(e => e.profession === '使徒').length;

            // 檢查是否可以使用「繁衍的權能」(冷卻完畢 且 場上數量 < 20)
            if (proliferateSkill && proliferateSkill.currentCooldown === 0 && apostleCount < 20) {
                this.logMessage('combat', `${attacker.name} 施放了 <span class="text-pink-400">[繁衍的權能]</span>！`, 'skill');

                // 1. 複製自己
                const newClone = this.cloneApostle(attacker);

                // 2. 將複製體加入戰場
                this.combat.enemies.push(newClone);
                
                // 3. 施放後，自己和複製體的技能都進入冷卻
                proliferateSkill.currentCooldown = proliferateSkill.baseCooldown;
                const cloneSkill = newClone.skills.find(s => s.id === 'apostle_proliferate');
                if (cloneSkill) {
                    cloneSkill.currentCooldown = cloneSkill.baseCooldown;
                }

                this.logMessage('combat', `一個新的 ${newClone.name} 出現在戰場上！`, 'enemy');

                // 4. 處理「重現的權能」：立即追加一次普通攻擊
                this.logMessage('combat', `在 [重現的權能] 的影響下，${attacker.name} 立即再次行動！`, 'skill');
                const livingAllies = this.combat.allies.filter(a => a.isAlive());
                if (livingAllies.length > 0) {
                    const target = livingAllies[randomInt(0, livingAllies.length - 1)];
                    // 使用 await 確保攻擊動畫播放完畢
                    await this.processAttack(attacker, target, false);
                }
                
                // 5. 結束使徒的回合
                return; 
            }
        }
        const isAlly = this.combat.allies.some(a => a.id === attacker.id);
        const allies = isAlly ? this.combat.allies.filter(u => u.isAlive()) : this.combat.enemies.filter(u => u.isAlive());
        const enemies = isAlly ? this.combat.enemies.filter(u => u.isAlive()) : this.combat.allies.filter(u => u.isAlive());

        if (enemies.length === 0) return;

        let actionTaken = false;

        if (attacker.skills && attacker.skills.length > 0) {
            const skill = attacker.skills[0];
            if (skill.currentCooldown === 0) {
                if (skill.type === 'team_heal') {
                    const totalMaxHp = allies.reduce((sum, a) => sum + a.maxHp, 0);
                    const totalCurrentHp = allies.reduce((sum, a) => sum + a.currentHp, 0);
                    if ((totalCurrentHp / totalMaxHp) < skill.triggerHp) {
                        await this.executeSkill(skill, attacker, allies, enemies);
                        actionTaken = true;
                    }
                } else if (skill.type === 'charge_nuke') {
                // 法師技能的獨立施放邏輯
                const isCasting = attacker.statusEffects.some(e => e.type === 'charge_nuke');
                if (!isCasting) {
                    await this.executeSkill(skill, attacker, allies, enemies);
                    actionTaken = true;
                }
            } else {
                // 檢查施法者身上是否已經有同類型的技能效果
                const isEffectActive = attacker.statusEffects.some(e => e.type === skill.type);
                if (!isEffectActive) {
                    await this.executeSkill(skill, attacker, allies, enemies);
                    actionTaken = true;
                }
            }
        }
    }
        
        const chargingEffect = attacker.statusEffects.find(e => e.type === 'charge_nuke');
        if (chargingEffect) {
            if (chargingEffect.chargeTurns <= 0) {
                this.logMessage('combat', `[${attacker.name}] 的 [破滅法陣] 詠唱完畢！`, 'skill');
                const damage = Math.floor(attacker.getTotalStat('intelligence') * chargingEffect.multiplier);
                for (const target of enemies) {
                    if (target.isAlive()) {
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        this.logMessage('combat', `法陣衝擊了 ${target.name}，造成 ${damage} 點無法閃避的傷害。`, 'enemy');
                        if (!target.isAlive()) this.logMessage('combat', `${target.name} 被擊敗了！`, 'system');
                    }
                }
                attacker.statusEffects = attacker.statusEffects.filter(e => e.type !== 'charge_nuke');
            } else {
                this.logMessage('combat', `${attacker.name} 正在詠唱... (剩餘 ${chargingEffect.chargeTurns} 回合)`, 'info');
            }
            actionTaken = true;
        }

        if (!actionTaken) {
            const target = enemies[randomInt(0, enemies.length - 1)];
            await this.processAttack(attacker, target, false);
        }
        
        await new Promise(res => setTimeout(res, 300));
    },

    async processAttack(attacker, target, isExtraAttack = false, overrideDamage = null) { //  isExtraAttack，預設為 false
        const isAllyAttacking = this.combat.allies.some(a => a.id === attacker.id);
        const logType = isAllyAttacking ? 'player' : 'enemy';
        const enemyTeam = isAllyAttacking ? this.combat.enemies : this.combat.allies;
        let currentTarget = target;

        // 嘲諷判定 (邏輯不變)
        const taunter = enemyTeam.find(e => e.statusEffects.some(s => s.type === 'taunt'));
        if (taunter && taunter.id !== currentTarget.id && taunter.isAlive()) {
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${taunter.name} 吸引了！`, 'info');
            currentTarget = taunter;
        }

        const weapon = attacker.equipment.mainHand;
        const weaponType = weapon ? weapon.baseName : '徒手';
        if (!isExtraAttack) { // 連擊的追擊不顯示此訊息
            this.logMessage('combat', `${attacker.name} 使用 [${weaponType}] 攻擊 ${currentTarget.name}！`, logType);
        }

        // --- v2.5.1 命中判定 (修正骰子數量) ---
        const weaponJudgementMap = { '劍': 'strength', '雙手劍': 'strength', '長槍': 'luck', '弓': 'agility', '法杖': 'intelligence', '徒手': 'strength' };
        const judgementStat = weaponJudgementMap[weaponType] || 'strength';

        // 攻擊方計算
        const attackerStatValue = attacker.getTotalStat(judgementStat, this.isStarving);
        const attackerDiceCount = Math.max(1, Math.floor(attackerStatValue / 20)); // 屬性決定骰子數量
        const attackerQualityBonus = attacker.equipment.mainHand?.qualityBonus || 0;
        const attackerRoll = rollDice(`${attackerDiceCount}d20`); // 擲多顆骰子
        const attackerTotal = attackerRoll.total + attackerQualityBonus; // 總和 + 品質加成

        // 防守方計算
        const defenderStatValue = currentTarget.getTotalStat(judgementStat, this.isStarving);
        const defenderDiceCount = Math.max(1, Math.floor(defenderStatValue / 20));
        const defenderArmorBonus = currentTarget.equipment.chest?.qualityBonus || 0;
        const defenderShieldBonus = currentTarget.equipment.offHand?.qualityBonus || 0;
        const defenderRoll = rollDice(`${defenderDiceCount}d20`);
        const defenderTotal = defenderRoll.total + defenderArmorBonus + defenderShieldBonus;

        // 顯示擲骰動畫 (現在會傳入所有擲骰結果)
        if (attacker.id === this.player.id || currentTarget.id === this.player.id) {
            // 判斷攻擊者是否為我方成員
            const isAllyAttacking = this.combat.allies.some(a => a.id === attacker.id);
            
            let playerSideRolls;
            let enemySideRolls;

            if (isAllyAttacking) {
                // 如果是我方攻擊，則攻擊方是我方，防守方是敵方
                playerSideRolls = attackerRoll;
                enemySideRolls = defenderRoll;
            } else {
                // 如果是敵方攻擊，則攻擊方是敵方，防守方是我方
                playerSideRolls = defenderRoll;
                enemySideRolls = attackerRoll;
            }

            // 根據 isAllyAttacking 變數，動態決定標題文字
            const animationTitle = isAllyAttacking ? '攻擊判定' : '迴避判定';

            // 將固定的標題替換為動態產生的 animationTitle
            await this.showDiceRollAnimation(animationTitle, 
                playerSideRolls.rolls.map(r => ({ sides: playerSideRolls.sides, result: r })), 
                enemySideRolls.rolls.map(r => ({ sides: enemySideRolls.sides, result: r }))
            );
        }
        
        this.logMessage('combat', `> 攻擊方 (${judgementStat}): ${attackerRoll.total}(擲骰) + ${attackerQualityBonus}(品質) = ${attackerTotal}`, 'info');
        this.logMessage('combat', `> 防守方 (${judgementStat}): ${defenderRoll.total}(擲骰) + ${defenderArmorBonus}(防具) + ${defenderShieldBonus}(盾牌) = ${defenderTotal}`, 'info');

        if (attackerTotal <= defenderTotal) { 
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${currentTarget.name} 閃過了！`, logType === 'player' ? 'enemy' : 'player');
            
            // 顯示 MISS 浮動文字
            showFloatingText(currentTarget.id, 'MISS', 'miss');

            return;
        }
        
        this.logMessage('combat', `攻擊命中！`, 'success');

        // --- v2.5 傷害計算 ---
        let damage;
        // 2. 檢查是否有指定傷害值
        if (overrideDamage !== null) {
            damage = overrideDamage;
            this.logMessage('combat', `一股神聖的力量形成了懲罰！`, 'system'); // 加入提示，增加氛圍
        } else {
            // 如果沒有指定傷害，則正常計算
            damage = attacker.calculateDamage(this.isStarving);
            damage += (attacker.equipment.chest?.stats.attackBonus || 0) + (attacker.equipment.offHand?.stats.attackBonus || 0);
        }

        // --- 機率觸發系統  ---
        let attackerGamblerBonus = 0;
        let critAffixCount = 0;
        let penetratingAffixCount = 0;
        let devastatingAffixCount = 0; // 新增：計算「毀滅的」詞綴數量

        Object.values(attacker.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.key === 'gambler' && affix.effects) {
                    attackerGamblerBonus += affix.effects.value;
                }
                if (affix.key === 'critical_strike') {
                    critAffixCount++;
                }
                if (affix.key === 'penetrating') {
                    penetratingAffixCount++;
                }
                // 修改：不再覆蓋倍率，而是計數
                if (affix.key === 'devastating') {
                    devastatingAffixCount++;
                }
            });
        });

        const totalCritChance = 5.0 + (critAffixCount * 10) + attackerGamblerBonus;
        if (rollPercentage(totalCritChance)) {
            this.logMessage('combat', `致命一擊！`, 'crit');

            // 1. 設定基礎爆擊倍率
            const baseCritMultiplier = 1.5;
            // 2. 計算基礎爆擊傷害
            let baseCritDamage = Math.floor(damage * baseCritMultiplier);

            // 3. 如果有「毀滅的」詞綴，計算額外傷害
            if (devastatingAffixCount > 0) {
                const devastatingAffixData = STANDARD_AFFIXES.devastating;
                const bonusPerAffix = devastatingAffixData.effects.crit_damage_bonus; // 取得我們設定的 0.5
                // 額外傷害 = (原始傷害 * 基礎爆擊倍率 * 每個詞綴的加成) * 詞綴數量
                const bonusDamage = Math.floor((damage * baseCritMultiplier * bonusPerAffix) * devastatingAffixCount);
                
                this.logMessage('combat', `[毀滅的] 效果觸發 x${devastatingAffixCount}，額外造成 ${bonusDamage} 點爆擊傷害！`, 'skill');
                damage = baseCritDamage + bonusDamage;
            } else {
                damage = baseCritDamage;
            }
        }

        // --- 處理「穿透的」詞綴 ---
        let penetrationEffect = 0; // 0 代表不穿透
        if (penetratingAffixCount > 0) {
            const totalPenetratingChance = (penetratingAffixCount * 10) + attackerGamblerBonus; // 基礎機率 10%
            if (rollPercentage(totalPenetratingChance)) {
                const affixInstance = Object.values(attacker.equipment).flatMap(i => i ? i.affixes : []).find(a => a.key === 'penetrating');
                if (affixInstance) {
                    penetrationEffect = affixInstance.procInfo.value; // 這是 0.1
                    this.logMessage('combat', `${attacker.name} 的 [穿透的] 詞綴發動，削弱了目標的防禦！`, 'skill');
                }
            }
        }

        // --- 傷害減免與格擋判定 ---
        const armor = currentTarget.equipment.chest;
        if (armor && armor.stats.damageReduction) {
            const effectiveReduction = armor.stats.damageReduction * (1 - penetrationEffect); // 應用穿透效果
            damage = Math.floor(damage * (1 - effectiveReduction / 100));
            this.logMessage('combat', `> ${currentTarget.name} 的 ${armor.baseName} 減免了 ${effectiveReduction.toFixed(1)}% 的傷害。`, 'info');
        }
        
        // ... (格擋的詞綴 和 盾牌原生格擋 的程式碼不變) ...
        let defenderGamblerBonus = 0;
        let blockingAffixCount = 0;
        Object.values(currentTarget.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.key === 'gambler') defenderGamblerBonus += affix.effects.value;
                if (affix.key === 'blocking') blockingAffixCount++;
            });
        });
        
        let wasBlockedByAffix = false;
        if (blockingAffixCount > 0) {
            const totalBlockingChance = (blockingAffixCount * 5) + defenderGamblerBonus;
            if (rollPercentage(totalBlockingChance)) {
                damage = 0; wasBlockedByAffix = true;
                this.logMessage('combat', `${currentTarget.name} 的 [格擋的] 詞綴發動，完全格擋了本次傷害！`, 'skill');
            }
        }

        const shield = currentTarget.equipment.offHand;
        if (!wasBlockedByAffix && shield && shield.baseName === '盾') {
            // --- 將 d20 判定改為百分比判定 ---

            // 1. 從盾牌的 blockTarget 計算基礎格擋率
            const baseBlockChance = (20 - (shield.stats.blockTarget || 20)) * 5; // (20-目標值)*5 = 發動率%
            
            // 2. 加上「賭徒的」詞綴提供的總加成 (此變數在稍早的「格擋的」詞綴判定中已計算好)
            const finalBlockChance = baseBlockChance + defenderGamblerBonus;
            
            // 3. 進行百分比擲骰
            this.logMessage('combat', `> ${currentTarget.name} 進行盾牌格擋: 機率 ${finalBlockChance.toFixed(1)}%`, 'info');
            if (rollPercentage(finalBlockChance)) {
                damage = Math.floor(damage * 0.75); // 傷害減免25%
                this.logMessage('combat', `${currentTarget.name} 的盾牌成功格擋了攻擊，傷害大幅降低！`, 'skill');
            }
        }

        let finalDamage = Math.max(0, Math.floor(damage)); 
        // --- 使徒「歸零的權能」判定 ---
        if (currentTarget.profession === '使徒' && finalDamage > 0 && rollPercentage(25)) {
            const nullifySkill = currentTarget.skills.find(s => s.id === 'apostle_nullify');
            if (nullifySkill) {
                const healAmount = Math.floor(finalDamage * 0.5);
                currentTarget.currentHp = Math.min(currentTarget.maxHp, currentTarget.currentHp + healAmount);
                this.logMessage('combat', `${currentTarget.name} 的 [歸零的權能] 觸發！傷害變為0，並恢復了 ${healAmount} 點生命！`, 'crit');

                finalDamage = 0; // 將最終傷害歸零
            }
        }

        currentTarget.currentHp = Math.max(0, currentTarget.currentHp - finalDamage);
        this.logMessage('combat', `${attacker.name} 對 ${currentTarget.name} 造成了 ${finalDamage} 點傷害。`, isAllyAttacking ? 'player' : 'enemy');

        // --- 戰鬥中對話觸發邏輯 ---
        const hpPercent = currentTarget.currentHp / currentTarget.maxHp;

        // 檢查被打的是不是特殊 Boss
        if (currentTarget instanceof ApostleMaiden && currentTarget.isAlive()) {
            if (hpPercent <= 0.25 && !currentTarget.triggeredDialogues.has('hp_25')) {
                this.showInBattleDialogue(currentTarget, 'hp_25');
            } else if (hpPercent <= 0.50 && !currentTarget.triggeredDialogues.has('hp_50')) {
                this.showInBattleDialogue(currentTarget, 'hp_50');
            } else if (hpPercent <= 0.75 && !currentTarget.triggeredDialogues.has('hp_75')) {
                this.showInBattleDialogue(currentTarget, 'hp_75');
            }
        }
        
        // 檢查被打的是不是玩家，且攻擊者是使徒
        if (currentTarget.id === this.player.id && attacker instanceof ApostleMaiden) {
            if (hpPercent <= 0.50 && !attacker.triggeredDialogues.has('player_hp_50')) {
                this.showInBattleDialogue(attacker, 'player_hp_50');
            }
        }

        // --- 女神階段轉換判定 ---
        if (currentTarget instanceof SpiralGoddess) {
            const hpPercent = currentTarget.currentHp / currentTarget.maxHp;
            // 階段三觸發 (從階段二進入)
            if (currentTarget.phase === 2 && !currentTarget.phase3_triggered && hpPercent <= 0.75) {
                currentTarget.phase3_triggered = true; // 標記已觸發，避免重複
                attacker.phase = 3; 
                this.logMessage('combat', `女神：「${SPECIAL_BOSSES.spiral_goddess_mother.dialogues.phase3_start}」`, 'enemy');

                // 對我方所有單位施加 "女體化" Debuff
                this.combat.allies.forEach(ally => {
                    ally.statusEffects.push({
                        type: 'feminized',
                        duration: Infinity 
                    });
                    ally.updateHp(this.isStarving); 
                });
                this.logMessage('combat', '一陣奇異的光芒籠罩了我方全體，身體的構造似乎發生了不可逆的變化！', 'player');
            }
            if (currentTarget.phase === 3 && !currentTarget.phase4_triggered && hpPercent <= 0.50) {
                currentTarget.phase4_triggered = true;
                currentTarget.phase = 4;
                this.logMessage('combat', `女神：「${SPECIAL_BOSSES.spiral_goddess_mother.dialogues.phase4_start}」`, 'enemy');

                // 執行男體化：將魅力平均分配到四圍
                const charismaValue = currentTarget.stats.charisma;
                const bonusPerStat = Math.floor(charismaValue / 4);
                currentTarget.stats.strength += bonusPerStat;
                currentTarget.stats.agility += bonusPerStat;
                currentTarget.stats.intelligence += bonusPerStat;
                currentTarget.stats.luck += bonusPerStat;
                currentTarget.stats.charisma = 0;

                this.logMessage('combat', '女神捨棄了魅力，將其轉化為純粹的力量！', 'system');
            }
            // 階段五觸發 (從階段四進入)
            else if (currentTarget.phase === 4 && !currentTarget.phase5_triggered && hpPercent <= 0.25) {
                currentTarget.phase5_triggered = true;
                currentTarget.phase = 5;
                this.logMessage('combat', `女神：「${SPECIAL_BOSSES.spiral_goddess_mother.dialogues.phase5_start}」`, 'enemy');

                // 執行異性相吸：從玩家俘虜中召喚
                const captivesToSummon = [...this.captives].sort(() => 0.5 - Math.random()).slice(0, 20);
                if (captivesToSummon.length > 0) {
                    const summonedUnits = captivesToSummon.map(c => {
                        const summoned = new FemaleHuman(c.name, c.stats, c.profession, c.visual);
                        // 強化被召喚的單位
                        Object.keys(summoned.stats).forEach(stat => {
                            summoned.stats[stat] = Math.floor(summoned.stats[stat] * 1.5);
                        });
                        summoned.updateHp();
                        return summoned;
                    });
                    this.combat.enemies.push(...summonedUnits);
                    this.logMessage('combat', `你過去擄來的 ${summonedUnits.length} 名女性出現在戰場上，她們的眼神充滿了敵意！`, 'enemy');
                }
            } 
        }
        
        // 如果造成了傷害 (或0點傷害)，就顯示傷害數字
        if (finalDamage >= 0) {
            showFloatingText(currentTarget.id, finalDamage, 'damage');
        }
        // --- 攻擊者與防禦者「命中後」觸發效果 ---
        if (attacker.isAlive()) { // 攻擊方吸血
            let vampiricAffixCount = 0;
            Object.values(attacker.equipment).forEach(item => {
                if(item && item.affixes.some(a => a.key === 'vampiric')) vampiricAffixCount++;
            });
            if (vampiricAffixCount > 0) {
                const totalVampiricChance = (vampiricAffixCount * 10) + attackerGamblerBonus;
                if(rollPercentage(totalVampiricChance)) {
                    const healAmount = Math.floor(finalDamage * 0.5);
                    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
                    this.logMessage('combat', `${attacker.name} 的 [吸血的] 詞綴發動，恢復了 ${healAmount} 點生命。`, 'skill');
                }
            }
        }
        if (currentTarget.isAlive()) { // 防禦方尖刺反傷
            let spikyAffixCount = 0;
            Object.values(currentTarget.equipment).forEach(item => {
                if (item && item.affixes.some(a => a.key === 'spiky')) spikyAffixCount++;
            });
            if (spikyAffixCount > 0) {
                const totalSpikyChance = (spikyAffixCount * 10) + defenderGamblerBonus; // 「尖刺的」基礎機率 10%
                if (rollPercentage(totalSpikyChance)) {
                    const thornsDamage = Math.floor(finalDamage * 0.1);
                    if(thornsDamage > 0) {
                         attacker.currentHp = Math.max(0, attacker.currentHp - thornsDamage);
                         this.logMessage('combat', `${currentTarget.name} 的 [尖刺的] 詞綴發動，對 ${attacker.name} 反彈了 ${thornsDamage} 點傷害！`, 'skill');
                    }
                }
            }
        }
        if (!isExtraAttack && attacker.isAlive() && currentTarget.isAlive()) {
            let multiHitAffixCount = 0;
            Object.values(attacker.equipment).forEach(item => {
                if(item && item.affixes.some(a => a.key === 'multi_hit')) multiHitAffixCount++;
            });

            if (multiHitAffixCount > 0) {
                const totalMultiHitChance = (multiHitAffixCount * 5) + attackerGamblerBonus; // 基礎機率 5%
                if(rollPercentage(totalMultiHitChance)) {
                    this.logMessage('combat', `${attacker.name} 的 [連擊的] 詞綴發動，發起了追擊！`, 'skill');
                    await new Promise(res => setTimeout(res, 500)); // 為了戰鬥日誌可讀性，延遲0.5秒
                    await this.processAttack(attacker, currentTarget, true); // 再次攻擊，並標記為額外攻擊
                }
            }
        }

        // 後續處理
        if (!currentTarget.isAlive()) {
            // --- 使徒「螺旋的權能」復活判定 ---
            if (currentTarget.profession === '使徒' && rollPercentage(25)) {
                const reviveSkill = currentTarget.skills.find(s => s.id === 'apostle_spiral');
                const proliferateSkill = currentTarget.skills.find(s => s.id === 'apostle_proliferate');
                if (reviveSkill && proliferateSkill) {
                    currentTarget.currentHp = Math.floor(currentTarget.maxHp * 0.5); // 恢復50%生命
                    proliferateSkill.currentCooldown = 0; // 重置複製技能CD
                    this.logMessage('combat', `${currentTarget.name} 在 [螺旋的權能] 的影響下復活了，並準備再次繁衍！`, 'crit');
                    return; // 使用 return 提前結束函式，跳過後續的死亡處理
                }
            }
            this.logMessage('combat', `${currentTarget.name} 被擊敗了！`, 'system');
            const isTargetAnAlly = this.combat.allies.some(a => a.id === currentTarget.id);
            if (isTargetAnAlly) {
                if (currentTarget.id !== this.player.id) this.handlePartnerDeath(currentTarget.id);
            } else {
                this.gainResourcesFromEnemy(currentTarget);
                this.handleLootDrop(currentTarget);
            }
        }
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
            // 【修正】移除材質類型的強制指定，讓所有騎士的盔甲都能隨機材質
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

                // --- 已包含上一個問題的修正 ---
                const possibleItemsForSlot = this.craftableTypes.filter(t => t.slot === slot);
                if (possibleItemsForSlot.length === 0) continue;
                const baseItem = possibleItemsForSlot[randomInt(0, possibleItemsForSlot.length - 1)];
                // --- 修正結束 ---
                
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

        // --- v2.5 規則：根據類型和材質等級賦予基礎數值 ---
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
                        damageReduction: PLATE_ARMOR_STATS[tier].damageReduction
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

        // --- 詞綴生成邏輯 (維持不變) ---
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

    handlePartnerDeath(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;

        // --- 應用「螺旋的權能」技能效果 ---
        const skillId = 'tribe_spiral_authority';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            if (rollPercentage(skillData.levels[0].effect.chance * 100)) {
                partner.currentHp = partner.maxHp; // 恢復滿血
                this.logMessage('combat', `在「螺旋的權能」的守護下，${partner.name} 奇蹟般地從死亡邊緣歸來！`, 'crit');
                // 直接 return，中斷後續的死亡移除邏輯
                return; 
            }
        }

        // 如果技能沒觸發，則執行正常的死亡邏輯
        this.logMessage('combat', `你的夥伴 ${partner.name} 在戰鬥中陣亡了！他將永遠離開你...`, 'enemy');
        this.partners = this.partners.filter(p => p.id !== partnerId);
        this.player.party = this.player.party.filter(p => p.id !== partnerId);
        this.player.updateHp(this.isStarving);
    },

    async attemptSneakEscape() {
        this.logMessage('combat', '你嘗試潛行脫離戰鬥...', 'player');
        
        const playerParty = this.combat.allies;
        const enemyParty = this.combat.enemies.filter(e => e.isAlive());

        const contestResult = this.performAbilityContest(playerParty, enemyParty);

        // 【核心修改】根據 rolls 陣列來產生骰子
        await this.showDiceRollAnimation('脫離判定', 
            contestResult.partyA_Details.rolls.map(r => ({ sides: 20, result: r })), 
            contestResult.partyB_Details.rolls.map(r => ({ sides: 20, result: r }))
        );

        this.logMessage('combat', `我方脫離擲骰: ${contestResult.partyA_Value - contestResult.partyA_Details.partySize} + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('combat', `敵方追擊擲骰: ${contestResult.partyB_Value - contestResult.partyB_Details.partySize} + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');
        
        if (contestResult.partyA_Value > contestResult.partyB_Value) { 
            this.logMessage('combat', '脫離成功！', 'success');
            this.finishCombatCleanup();
            return 'escaped';
        } else {
            this.logMessage('combat', '脫離失敗！', 'enemy');
            return 'failed';
        }
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

    endCombat(victory) {
        // --- 使徒戰鬥結算 ---
        const wasApostleBattle = this.combat.currentEnemyGroup.some(e => e instanceof ApostleMaiden);
        if (wasApostleBattle) {
            if (victory) {
                // 勝利：捕獲特殊俘虜
                this.logMessage('tribe', `你成功擊敗了螺旋女神的使徒！`, 'success');
                
                // 根據GDD創建俘虜
                const captiveApostle = new FemaleHuman(
                    '使徒 露娜',
                    { strength: 180, agility: 180, intelligence: 180, luck: 180, charisma: 120 },
                    '使徒',
                    SPECIAL_BOSSES.apostle_maiden.visual, // 直接使用我們定義好的外觀
                    'hell' // 標記為最高難度來源
                );

                this.captives.push(captiveApostle);
                this.logMessage('tribe', `使徒的分身 [露娜] 被你捕獲，出現在了地牢中！`, 'crit');

            } else {
                // 失敗：重置繁衍計數器
                this.logMessage('tribe', `你在使徒的無限增殖面前倒下了...`, 'enemy');
                this.totalBreedingCount = 0;
                this.logMessage('tribe', `你對繁衍的渴望似乎減退了。 (總繁衍次數已重置)`, 'system');
            }
            if (!this.flags.defeatedApostle) {
            this.flags.defeatedApostle = true;
            this.logMessage('tribe', `你獲得了關鍵物品 [繁衍之證]！繁衍系技能樹已解鎖！`, 'system');
            }
        }
        else if (this.combat.currentEnemyGroup.some(e => e instanceof SpiralGoddess)) {
            if (victory) {
                this.logMessage('tribe', `你戰勝了神之試煉，證明了哥布林存在的價值！`, 'success');

                // 根據GDD創建俘虜
                const captiveGoddess = new FemaleHuman(
                    '女神 露娜',
                    SPECIAL_BOSSES.spiral_goddess_mother.captiveFormStats,
                    '女神',
                    SPECIAL_BOSSES.spiral_goddess_mother.visual,
                    'hell'
                );
                this.captives.push(captiveGoddess);
                this.logMessage('tribe', `女神的分身 [露娜] 出現在了你的地牢中，她似乎失去了大部分的力量...`, 'crit');

                if (!this.flags.defeatedGoddess) {
                    this.flags.defeatedGoddess = true;
                    this.logMessage('tribe', `你獲得了關鍵物品 [螺旋的權能]！權能系被動技能已解鎖！`, 'system');
                }

                this.pendingDecisions.push({ type: 'crone_dialogue' });

            } else {
                this.logMessage('tribe', `你在絕對的神力面前化為了塵埃...`, 'enemy');
                // 女神戰失敗沒有特殊懲罰，玩家會在重生後繼續
            }
        }

        // 這個檢查將覆蓋所有後續的勝利/失敗邏輯。
        if (this.player && !this.player.isAlive()) {
            this.initiateRebirth();
            return; // 直接觸發重生並中斷後續所有程式碼
        }
        // 在所有邏輯開始前，檢查時間耗盡標記
        if (this.currentRaid && this.raidTimeExpired) {
            this.raidTimeExpired = false; // 重置標記
            if (victory) {
                // 如果玩家贏了當前戰鬥，立即觸發增援戰
                this.triggerReinforcementBattle();
            } else {
                // 如果玩家輸了當前戰鬥，直接結束掠奪
                this.prepareToEndRaid(true);
            }
            if (this.postBattleBirths.length > 0) {
                this.postBattleBirths.forEach(birth => {
                    this.pendingDecisions.push({
                        type: 'partner',
                        list: [...this.partners, birth.newborn],
                        limit: this.partnerCapacity,
                        context: { mother: birth.mother, newborn: birth.newborn }
                    });
                });
                this.postBattleBirths = []; // 清空暫存列表
                this.checkAndProcessDecisions(); // 立即觸發決策視窗
            }
            return; // 中斷後續的 endCombat 程式碼，防止邏輯衝突
        }
        // --- 處理非掠奪戰鬥（如復仇小隊）---
        if (!this.currentRaid) {
            if (victory) {
                this.logMessage('tribe', '你成功擊退了來襲的敵人！', 'success');

                // 步驟1: 處理戰利品 (俘虜)
                const defeatedFemales = this.combat.enemies.filter(e => e instanceof FemaleHuman && !e.isAlive());
                if (defeatedFemales.length > 0) {
                    if ((this.dungeonCaptives.length + defeatedFemales.length) > this.captiveCapacity) {
                        this.logMessage('tribe', '地牢空間不足...', 'warning');
                        this.pendingDecisions.push({
                            type: 'dungeon',
                            list: [...this.dungeonCaptives, ...defeatedFemales], // <--- 修改回只包含地牢俘虜
                            limit: this.captiveCapacity,
                            context: { postBattleBirths: this.postBattleBirths }
                        });
                    } else {
                        this.captives.push(...defeatedFemales);
                        this.logMessage('tribe', `你俘虜了 ${defeatedFemales.length} 名戰敗的敵人。`, 'info');
                    }
                }
                
                // 步驟2: 清理戰鬥狀態 (但先不切換畫面)
                this.finishCombatCleanup(true);
                // 步驟3: 呼叫每日結算 (它會負責換天、恢復血量、處理生產等所有事情)
                this.processDailyUpkeep();

            } else {
                //   復仇小隊戰敗懲罰邏輯
                this.logMessage('tribe', '你在部落保衛戰中失敗了！', 'enemy');

                // 直接呼叫權威函式，移除所有俘虜
                this.removeAllCaptives('rescued');
            }
            return; // 結束函式，不再執行後續的掠奪邏輯
        }

        const defeatedFemales = this.combat.enemies.filter(e => e instanceof FemaleHuman && !e.isAlive());
        if (defeatedFemales.length > 0) {
            // 不再直接轉移舊的敵人物件，而是根據敵人的資料，
            // 創建一個全新的、獨立的 FemaleHuman 物件作為俘虜。
            const newCaptives = defeatedFemales.map(enemy => {
                const newCaptive = new FemaleHuman(
                    enemy.name,
                    enemy.stats,
                    enemy.profession,
                    enemy.visual,
                    enemy.originDifficulty
                );
                // 確保新俘虜的生命值是滿的
                newCaptive.maxHp = newCaptive.calculateMaxHp();
                newCaptive.currentHp = newCaptive.maxHp;
                return newCaptive; // 返回這個全新的「房子」
            });

            // 將這些全新的俘虜物件加入攜帶列表
            this.currentRaid.carriedCaptives.push(...newCaptives);
        }

        if (this.player && !this.player.isAlive()) {
            this.logMessage('tribe', '夥伴們獲得了勝利！牠們將倒下的哥布林王帶回了部落。', 'success');
        }

        if (this.combat.isReinforcementBattle) {
            if (this.isRetreatingWhenTimeExpired) {
                this.logMessage('tribe', '你擊敗了前來阻截的騎士團，成功帶著戰利品返回部落！', 'success');
                this.prepareToEndRaid(false);
            } else {
                this.currentRaid.timeRemaining = Infinity;
                this.currentRaid.reinforcementsDefeated = true;
                this.logMessage('raid', '你擊敗了騎士團的增援部隊！時間壓力消失了，你可以繼續探索這座城鎮。', 'success');
                this.finishCombatCleanup();
            }
            this.isRetreatingWhenTimeExpired = false;
        } else {
            if (this.currentRaid.carriedCaptives.length > this.carryCapacity) {
                this.openCaptiveManagementModal('raid', this.currentRaid.carriedCaptives, this.carryCapacity);
            } else {
                this.finishCombatCleanup();
            }
        }
    },

    tickStatusEffects() {
        const allUnitsForRegen = [...this.combat.allies, ...this.combat.enemies];
        allUnitsForRegen.forEach(unit => {
            if (!unit.isAlive() || !unit.equipment) return;
            
            const regeneratingAffix = Object.values(unit.equipment).flatMap(i => i ? i.affixes : []).find(a => a.key === 'regenerating');
            if (regeneratingAffix) {
                const healAmount = Math.floor(unit.maxHp * regeneratingAffix.procInfo.value);
                if (healAmount > 0) {
                    unit.currentHp = Math.min(unit.maxHp, unit.currentHp + healAmount);
                    this.logMessage('combat', `${unit.name} 的 [再生] 詞綴發動，恢復了 ${healAmount} 點生命。`, 'skill');
                }
            }
        });
        const allUnits = [...this.combat.allies, ...this.combat.enemies];
        allUnits.forEach(unit => {
            if (!unit.statusEffects) unit.statusEffects = [];
            unit.statusEffects.forEach(effect => {
                if(effect.duration > 0) effect.duration--;
                if(effect.type === 'charge_nuke' && effect.chargeTurns > 0) effect.chargeTurns--;
            });
            unit.statusEffects = unit.statusEffects.filter(effect => effect.duration > 0);
        });
    },
    async executeSkill(skill, caster, allies, enemies) {
        this.logMessage('combat', `${caster.name} 施放了 <span class="text-pink-400">[${skill.name}]</span>！`, 'skill');
        if(caster.skills[0]) caster.skills[0].currentCooldown = skill.cd;

        switch (skill.type) {
            case 'aoe_str':
            case 'aoe_agi':
                const damageStat = skill.type === 'aoe_str' ? 'strength' : 'agility';
                const damage = Math.floor(caster.getTotalStat(damageStat) * skill.multiplier);
                for (const target of enemies) {
                    if (target.isAlive()) {
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        this.logMessage('combat', `[${skill.name}] 對 ${target.name} 造成了 ${damage} 點傷害。`, 'enemy');
                        if (!target.isAlive()) this.logMessage('combat', `${target.name} 被擊敗了！`, 'system');
                    }
                }
                break;
            case 'taunt':
                caster.statusEffects.push({ type: 'taunt', duration: skill.duration + 1 });
                this.logMessage('combat', `${caster.name} 吸引了所有人的注意！`, 'info');
                break;
            case 'reflect_buff':
                const existingBuff = allies.some(a => a.statusEffects.some(e => e.type === 'reflect_buff'));
                if (!existingBuff) {
                    allies.forEach(ally => ally.statusEffects.push({ type: 'reflect_buff', duration: skill.duration, damagePercent: skill.damagePercent }));
                    this.logMessage('combat', '騎士團啟用了槍陣，攻擊他們將會反噬自身！', 'info');
                }
                break;
            case 'king_nuke':
                const king = enemies.find(e => e.id === this.player.id);
                if (king && king.isAlive()) {
                    const kingDamage = caster.getTotalStat('strength') + caster.getTotalStat('agility');
                    king.currentHp = Math.max(0, king.currentHp - kingDamage);
                    this.logMessage('combat', `[騎士道] 無視了你的夥伴，對哥布林王造成了 ${kingDamage} 點巨大傷害！`, 'enemy');
                    if (!king.isAlive()) this.logMessage('combat', `${king.name} 被擊敗了！`, 'system');
                }
                break;
            case 'charge_nuke':
            //現在將 multiplier 和 chargeTurns 一同儲存到狀態效果中
            caster.statusEffects.push({ 
                type: 'charge_nuke', 
                duration: skill.chargeTime + 1, 
                chargeTurns: skill.chargeTime, 
                multiplier: skill.multiplier // 這裡就是關鍵的修正
            });
            this.logMessage('combat', `${caster.name} 開始詠唱咒文，空氣變得凝重起來...`, 'info');
            break;
            case 'team_heal':
                const healAmount = caster.getTotalStat('intelligence') * allies.length;
                allies.forEach(ally => {
                    if(ally.isAlive()) {
                        ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                    }
                });
                this.logMessage('combat', `聖光籠罩了騎士團，每名成員恢復了 ${healAmount} 點生命！`, 'success');
                break;
        }
        await new Promise(res => setTimeout(res, 500));
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
    
    openCaptiveManagementModal(type, list, limit, dungeonLimit = -1, context = null) {
        const modal = this.modals.captiveManagement;
        modal.type = type;
        modal.list = list;
        modal.limit = limit;
        modal.dungeonLimit = dungeonLimit;
        modal.context = context; // 儲存額外資訊 (母親和新生兒)

        if (type === 'raid') {
            modal.title = '攜帶量已滿';
            modal.selectedIds = list.slice(0, limit).map(c => c.id);
        } else if (type === 'partner') {
            modal.title = '寢室空間不足';
            // 預設選取所有舊的夥伴，不選新生兒
            modal.selectedIds = list.filter(p => p.id !== context.newborn.id).map(p => p.id);
        } else { // dungeon
            modal.title = '地牢已滿';
            modal.selectedIds = list.filter(c => this.captives.some(existing => existing.id === c.id)).map(c => c.id);
        }
        // 自動調整預選，確保不超過地牢上限 (這段邏輯對夥伴管理無影響，但保留是安全的)
        if (dungeonLimit > -1) {
            let selectedDungeonCaptives = modal.list.filter(c => modal.selectedIds.includes(c.id) && !c.isPregnant && !c.isMother);
            while (selectedDungeonCaptives.length > dungeonLimit) {
                const captiveToRemove = selectedDungeonCaptives.pop();
                modal.selectedIds = modal.selectedIds.filter(id => id !== captiveToRemove.id);
            }
        }

        modal.isOpen = true;
    },
    confirmCaptiveSelection() {
        const modal = this.modals.captiveManagement;
        const selectedIds = new Set(modal.selectedIds);

        // 根據 modal 的類型分別處理
        if (modal.type === 'raid') {
            // 情況一：在掠奪中途，整理「攜帶」的俘虜
            this.currentRaid.carriedCaptives = modal.list.filter(c => selectedIds.has(c.id));
            this.logMessage('raid', `你重新選擇了要攜帶的俘虜，當前攜帶 ${this.currentRaid.carriedCaptives.length} 人。`, 'info');
            modal.isOpen = false;
            this.finishCombatCleanup(); // 呼叫這個函式會關閉戰鬥畫面並返回掠奪地圖
            return;
        }

        // 情況二和三：返回部落或日常事件時，整理「地牢」的俘虜
        const maternityCaptives = this.captives.filter(c => c.isMother || c.isPregnant);
        const keptDungeonCaptives = modal.list.filter(c => selectedIds.has(c.id));
        this.captives = [...maternityCaptives, ...keptDungeonCaptives];
        
        if (modal.type === 'raid_return') {
            this.logMessage('tribe', `你整理了地牢，最終留下了 ${this.dungeonCaptives.length} 名俘虜。`, 'success');
            this.finalizeRaidReturn(); // 返回部落
        } else if (modal.type === 'dungeon') { 
            this.logMessage('tribe', `你整理了地牢，最終留下了 ${this.dungeonCaptives.length} 名俘虜。`, 'success');
            this.processDailyUpkeep(); // 繼續日常結算
        }
        
        modal.isOpen = false;
    },
    openPartnerManagementModal(list, limit, context) {
        const modal = this.modals.partnerManagement;
        modal.list = list;
        modal.limit = limit;
        modal.context = context;
        modal.newbornId = context.newborns.map(nb => nb.newborn.id); // 'newbornId' 欄位現在儲存一個 ID 陣列
        const newbornIdSet = new Set(modal.newbornId);
        modal.selectedIds = list.filter(p => !newbornIdSet.has(p.id)).map(p => p.id);

        modal.isOpen = true;
    },

    confirmPartnerSelectionDecision() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        
        // 我們不再於此處處理裝備，將其完全交給後續的 releasePartner 函式，這樣可以避免重複移動裝備導致的 bug
        const discardedPartners = modal.list.filter(p => !selectedSet.has(p.id));
        const itemsToReturn = discardedPartners.flatMap(p => Object.values(p.equipment).filter(item => item !== null));
        const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
        
        if (itemsToReturn.length > availableSpace) {
            this.modals.itemManagement = {
                isOpen: true,
                title: `處理被放棄夥伴的裝備`,
                message: `為新生兒騰出空間前，需先處理被放棄夥伴身上的裝備。請先處理以下物品，直到剩餘數量小於等於 ${availableSpace}。`,
                items: [...itemsToReturn],
                capacity: availableSpace,
                onConfirm: () => {
                    this.confirmPartnerSelectionDecision();
                }
            };
            modal.isOpen = false;
            return;
        }

        // 如果空間足夠，直接執行最終的確認與移除流程
        this.finalizePartnerSelection();
    },

    finalizePartnerSelection() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        const allNewbornsContext = modal.context.newborns;
        // 【新增】檢查是否來自掠奪回歸
        const wasFromRaidReturn = modal.context?.fromRaidReturn;

        // 找出被放棄的夥伴 (包含舊夥伴和新生兒)
        const discardedPartners = modal.list.filter(p => !selectedSet.has(p.id));
        
        // 呼叫權威的移除函式來逐出這些夥伴
        discardedPartners.forEach(p => {
            this.releasePartner(p.id);
        });

        // 更新夥伴總列表 (因為 releasePartner 已經處理了，這裡確保最終狀態一致)
        this.partners = this.partners.filter(p => selectedSet.has(p.id));
        
        // 找出所有被留下來的新生兒
        const keptNewborns = allNewbornsContext.filter(ctx => selectedSet.has(ctx.newborn.id));

        // 如果有任何新生兒被留下來，則將他們正式加入部落並給予獎勵
        if (keptNewborns.length > 0) {
            keptNewborns.forEach(ctx => {
                this.partners.push(ctx.newborn);
                this.player.skillPoints++;
                this.logMessage('tribe', `你為 ${ctx.newborn.name} 在寢室中騰出了空間！你獲得了 1 點技能點。`, 'success');
            });
            if (this.tutorial.active && !this.tutorial.finishedPartyMgmt) {
                this.triggerTutorial('firstBirth');
            }
        }
        
        // 找出所有被放棄的新生兒並記錄日誌
        const discardedNewborns = allNewbornsContext.filter(ctx => !selectedSet.has(ctx.newborn.id));
        if (discardedNewborns.length > 0) {
            const discardedNames = discardedNewborns.map(ctx => ctx.mother.name + "的孩子").join('、');
            this.logMessage('tribe', `你決定放棄 ${discardedNames}，為更強的夥伴保留了位置。`, 'info');
        }

        modal.isOpen = false;
        this.player.updateHp(this.isStarving);

        // 如果這個決策是來自剛結束的掠奪，則在這裡補上被延遲的 nextDay() 呼叫
        if (wasFromRaidReturn) {
            this.nextDay();
        }
    },

    // 1. 在函式定義中，加入一個帶有「預設值」的參數
    finishCombatCleanup(returnToTribe = false) {
        this.resetAllSkillCooldowns();

        if (this.currentRaid) {
            
            const defeatedEnemyIds = this.combat.enemies.filter(e => !e.isAlive()).map(e => e.id);// 找出所有戰敗的敵人ID
             
            defeatedEnemyIds.forEach(id => this.removeUnitFromRaidZone(id));// 對每一個戰敗者，都呼叫統一移除函式

            this.updateBuildingScoutText();
        }
        
        this.combat.allies = [];
        this.combat.enemies = [];
        this.combat.turn = 0;
        this.combat.log = [];
        this.combat.isProcessing = false;
        this.combat.currentEnemyGroup = [];
        this.combat.playerActionTaken = false;
        this.combat.isReinforcementBattle = false; // 統一在此處重置
        this.combat.isUnescapable = false;
        // 根據是否有掠奪來決定返回部落還是掠奪地圖
        this.screen = returnToTribe ? 'tribe' : 'raid';
    },
    showCustomAlert(message, onConfirmCallback = null) {
        this.modals.customAlert.message = message;
        this.modals.customAlert.onConfirm = onConfirmCallback;
        this.modals.customAlert.isOpen = true;
    },
    confirmCustomAlert() {
        this.modals.customAlert.isOpen = false;
        
        // 1. 先將可能存在的回呼函式複製到一個臨時變數中
        const callbackToExecute = this.modals.customAlert.onConfirm;

        // 2. 立刻將共用的狀態清理乾淨，設為 null
        this.modals.customAlert.onConfirm = null;

        // 3. 檢查我們複製出來的臨時變數是否為一個函式
        if (typeof callbackToExecute === 'function') {
            // 4. 如果是，則延遲執行它
            setTimeout(() => {
                callbackToExecute();
            }, 100);
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

    importSaveData: '', // 新增一個屬性來儲存匯入的文字

    exportGame() {
        const saveData = localStorage.getItem('goblinKingSaveFile');
        if (!saveData) {
            this.showCustomAlert('沒有找到存檔，請先儲存遊戲。');
            return;
        }

        // 使用 Clipboard API 進行自動複製
        navigator.clipboard.writeText(saveData)
            .then(() => {
                this.showCustomAlert('遊戲存檔已複製到剪貼簿！請貼到安全的地方保存。');
            })
            .catch(err => {
                console.error('自動複製失敗:', err);
                // 如果自動複製失敗，回退到傳統的彈出視窗方式
                this.showCustomAlert('自動複製失敗，請手動複製以下文字並妥善保存：<br><br>' + saveData);
            });
    },

    // 匯入存檔方法
    importGame() {
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

    unlockDlc() {
        const code = this.$refs.dlc_code_input.value.trim().toUpperCase();
        
        if (code === "HELLKNIGHTS20147") { // 這就是我們的解鎖碼
            if (!this.dlc.hells_knights) {
                this.dlc.hells_knights = true;
                this.showCustomAlert('「王國騎士團」DLC 已成功啟用！新內容將在下次遊戲或讀檔後生效。');
                this.saveGame(); // 自動存檔以保存解鎖狀態
            } else {
                this.showCustomAlert('您已經擁有此 DLC！');
            }
        } else {
            this.showCustomAlert('無效的解鎖碼。');
        }
        
        this.$refs.dlc_code_input.value = '';
    },

    checkAndProcessDecisions() {
        // 檢查是否在部落畫面，且是否有待辦事項
        if (this.screen === 'tribe' && this.pendingDecisions.length > 0) {
            // 延遲執行以確保畫面穩定
            setTimeout(() => this.processNextDecision(), 100);
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
    // 存檔拯救函式，用於修復汙染的舊存檔
    // 存檔拯救函式，增加強制ID清洗功能
    salvageSaveData() {
        
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

            this.player.updateHp(this.isStarving);
            this.partners.forEach(p => p.updateHp(this.isStarving));

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

    checkForSaveFile() {
        if (localStorage.getItem('goblinKingSaveFile')) {
            this.hasSaveFile = true;
        }
    },
    
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

    craftItem() {
        if (!this.canAffordCraft) {
            this.showCustomAlert('資源不足！');
            return;
        }
        if (this.player.inventory.length >= this.backpackCapacity) {
            this.showCustomAlert('你的背包已滿，無法製作新裝備！');
            return;
        }
        
        // --- 新的後台邏輯 ---
        const typeName = this.modals.armory.craftingType;
        const tier = this.modals.armory.craftingTier;

        // 1. 根據類型名稱找到對應的 materialCategory
        const craftableInfo = this.craftableTypes.find(t => t.baseName === typeName);
        if (!craftableInfo) {
            console.error("找不到可製作的類型:", typeName);
            return;
        }
        const category = craftableInfo.materialCategory;

        // 2. 在所有材質中，尋找同時滿足 "階級" 和 "分類" 的那一個
        const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => {
            const mat = EQUIPMENT_MATERIALS[key];
            return mat.tier === tier && mat.category === category;
        });

        if (!materialKey) {
            console.error(`找不到階級為 ${tier} 且分類為 ${category} 的材質。`);
            this.showCustomAlert('發生內部錯誤，找不到對應的材質！');
            return;
        }
        // --- 邏輯結束 ---

        const cost = this.getCraftingCost();
        this.resources.food -= cost.food;
        this.resources.wood -= cost.wood;
        this.resources.stone -= cost.stone;

        const roll = randomInt(1, 100);
        let qualityKey = 'worn';
        if (roll <= 5) qualityKey = 'legendary';
        else if (roll <= 15) qualityKey = 'epic';
        else if (roll <= 32) qualityKey = 'rare';
        else if (roll <= 58) qualityKey = 'uncommon';
        else if (roll <= 93) qualityKey = 'common';

        const newItem = this.createEquipment(
            materialKey, // 使用我們在後台找到的材質key
            qualityKey,
            typeName
        );

        this.player.inventory.push(newItem);
        this.logMessage('tribe', `你花費 食物x${cost.food}, 木材x${cost.wood}, 礦石x${cost.stone} 成功製作了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');
        this.showCustomAlert(`製作成功！\n你獲得了 [${newItem.name}]`);
    },

    decomposeItem(itemId) {
        if (this.buildings.armory.level === 0) {
            this.showCustomAlert('你需要先建造兵工廠才能分解裝備！');
            return;
        }
        let itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        let sourceArray = this.player.inventory;
        if (itemIndex === -1) {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            sourceArray = this.warehouseInventory;
        }
        if (itemIndex === -1) return;

        const item = sourceArray[itemIndex];
        const tier = item.material.tier;
        const originalCost = CRAFTING_COSTS[tier];
        if (!originalCost) return;

        // 根據兵工廠等級決定返還率
        const returnRate = [0.2, 0.3, 0.4, 0.5][this.buildings.armory.level - 1] || 0;
        
        // 計算三種資源的返還量
        const foodBack = Math.floor(originalCost.food * returnRate);
        const woodBack = Math.floor(originalCost.wood * returnRate);
        const stoneBack = Math.floor(originalCost.stone * returnRate);

        // 增加資源
        this.resources.food += foodBack;
        this.resources.wood += woodBack;
        this.resources.stone += stoneBack;

        this.logMessage('tribe', `你分解了 [${item.name}]，回收了食物x${foodBack}, 木材x${woodBack}, 礦石x${stoneBack}。`, 'info');

        sourceArray.splice(itemIndex, 1);
    },

    openDiscardConfirm(itemId) {
        const item = this.player.inventory.find(i => i.id === itemId) || this.warehouseInventory.find(i => i.id === itemId);
        if (item) {
            this.modals.discardConfirm.itemId = itemId;
            this.modals.discardConfirm.itemName = item.name;
            this.modals.discardConfirm.isOpen = true;
        }
    },
    executeDiscardItem() {
        const itemId = this.modals.discardConfirm.itemId;
        let itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            const itemName = this.player.inventory[itemIndex].name;
            this.player.inventory.splice(itemIndex, 1);
            this.logMessage('tribe', `你從背包丟棄了 [${itemName}]。`, 'info');
        } else {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            if (itemIndex > -1) {
                const itemName = this.warehouseInventory[itemIndex].name;
                this.warehouseInventory.splice(itemIndex, 1);
                this.logMessage('tribe', `你從倉庫丟棄了 [${itemName}]。`, 'info');
            }
        }
        this.modals.discardConfirm.isOpen = false;
        this.modals.discardConfirm.itemId = null;
        this.modals.discardConfirm.itemName = '';
    },

    equipItem(itemId, targetUnit) {
        if (!targetUnit) return;
        
        let itemIndex = -1;
        let sourceArray = null;

        // 先在玩家背包中尋找
        itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        sourceArray = this.player.inventory;

        // 【核心修改】只有在非掠奪畫面時，才去倉庫中尋找
        if (itemIndex === -1 && this.screen !== 'raid') {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            sourceArray = this.warehouseInventory;
        }

        if (itemIndex === -1) return; // 如果在哪都沒找到，就結束

        const itemToEquip = sourceArray[itemIndex];
        let slot = itemToEquip.slot; 

        // (後續的裝備檢查與裝備邏輯維持不變)
        const mainHandWeapon = targetUnit.equipment.mainHand;
        const offHandItem = targetUnit.equipment.offHand;
        
        if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName === '劍' && !offHandItem) {
            if (!this.dlc.hells_knights) {
                this.showCustomAlert('需要「王國騎士團」DLC 才能雙持單手劍！');
                return;
            }
        }
        if (itemToEquip.baseName === '盾' && mainHandWeapon && ['長槍', '法杖'].includes(mainHandWeapon.baseName)) {
            if (!this.dlc.hells_knights) {
                this.showCustomAlert('需要「王國騎士團」DLC 才能將長槍或法杖與盾牌搭配使用！');
                return;
            }
        }
        if (['長槍', '法杖'].includes(itemToEquip.baseName) && offHandItem?.baseName === '盾') {
            if (!this.dlc.hells_knights) {
                this.showCustomAlert('需要「王國騎士團」DLC 才能將長槍或法杖與盾牌搭配使用！');
                return;
            }
        }

        if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName === '劍' && !targetUnit.equipment.offHand) {
            slot = 'offHand';
        }
        
        if (!slot || !targetUnit.equipment.hasOwnProperty(slot)) return;

        if (slot === 'offHand') {
            if (mainHandWeapon && TWO_HANDED_WEAPONS.includes(mainHandWeapon.baseName)) {
                this.showCustomAlert(`裝備 ${mainHandWeapon.name} 時無法使用副手裝備！`);
                return;
            }
            if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName !== '劍') {
                this.showCustomAlert('只有在主手裝備單手劍時，才能在副手裝備另一把劍！');
                return;
            }
        }

        if (slot === 'mainHand' && TWO_HANDED_WEAPONS.includes(itemToEquip.baseName)) {
            if (targetUnit.equipment.offHand) {
                this.logMessage('tribe', `裝備雙手武器時自動卸下了 ${targetUnit.equipment.offHand.name}。`, 'info');
                this.unequipItem('offHand', targetUnit, true);
            }
        }

        if (targetUnit.equipment[slot]) {
            this.unequipItem(slot, targetUnit, true);
        }

        targetUnit.equipment[slot] = itemToEquip;
        sourceArray.splice(itemIndex, 1);
        
        if (targetUnit.updateHp) targetUnit.updateHp(this.isStarving);
        this.logMessage(this.screen === 'raid' ? 'raid' : 'tribe', `${targetUnit.name} 裝備了 <span style="color:${itemToEquip.quality.color};">[${itemToEquip.name}]</span>。`, 'success');
    },

    unequipItem(slot, targetUnit, silent = false) {
        if (!targetUnit || !targetUnit.equipment[slot]) return;
        
        const itemToUnequip = targetUnit.equipment[slot];

        if (this.screen === 'raid') {
            // 在掠奪中 -> 卸到背包
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.showCustomAlert('你的背包已滿，無法卸下裝備！');
                return;
            }
            this.player.inventory.push(itemToUnequip);
            if (!silent) {
                    this.logMessage('raid', `${targetUnit.name} 卸下了 <span style="color:${itemToUnequip.quality.color};">[${itemToUnequip.name}]</span>，物品已放入背包。`, 'info');
            }
        } else {
            if (this.warehouseInventory.length >= this.warehouseCapacity) {
                this.showCustomAlert('倉庫已滿，無法卸下裝備！');
                return;
            }
            this.warehouseInventory.push(itemToUnequip);
            if (!silent) {
                this.logMessage('tribe', `${targetUnit.name} 卸下了 <span style="color:${itemToUnequip.quality.color};">[${itemToUnequip.name}]</span>，物品已存入倉庫。`, 'info');
            }
        }
        
        targetUnit.equipment[slot] = null;

        if (targetUnit.updateHp) {
            targetUnit.updateHp(this.isStarving);
        } else if (targetUnit.id === this.player.id) { 
            this.player.updateHp(this.isStarving);
        }
    },

    moveToBackpack(itemId) {
        const itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.showCustomAlert('你的背包已滿！');
                return;
            }
            const [item] = this.warehouseInventory.splice(itemIndex, 1);
            this.player.inventory.push(item);
        }
    },

    moveToWarehouse(itemId) {
        const itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            if (this.warehouseInventory.length >= this.warehouseCapacity) {
                this.showCustomAlert('倉庫已滿！');
                return;
            }
            const [item] = this.player.inventory.splice(itemIndex, 1);
            this.warehouseInventory.push(item);
        }
    },

    getItemStatsString(item) {
        if (!item) return '';
        let parts = [];
        let baseStatParts = [];

        // 1. 收集品質加成
        if (item.qualityBonus !== 0) {
            const bonusText = item.qualityBonus > 0 ? `+${item.qualityBonus}` : item.qualityBonus;
            let bonusName = '';
            if (item.type === 'armor' || item.baseName === '盾') {
                bonusName = '防禦加成';
            } else if (item.type === 'weapon') {
                bonusName = '命中加成';
            }
            if (bonusName) {
                baseStatParts.push(`${bonusName}: ${bonusText}`);
            }
        }
        
        // 2. 收集裝備基礎屬性 (白字)
        if (item.stats && Object.keys(item.stats).length > 0) {
            const formattedBaseStats = Object.entries(item.stats).map(([key, value]) => {
                const nameMap = {
                    damage: '傷害',
                    attackBonus: '攻擊加成',
                    damageReduction: '傷害減免',
                    allStats: '全屬性',
                    blockTarget: '格擋目標值'
                };
                const unitMap = { damageReduction: '%' };
                return `${nameMap[key] || key} +${value}${unitMap[key] || ''}`;
            });
            baseStatParts.push(...formattedBaseStats);
        }

        // 3. 將所有原生屬性合併成一行
        if (baseStatParts.length > 0) {
            parts.push(`<span class="text-cyan-400">${baseStatParts.join(', ')}</span>`);
        }
        
        // 4. 顯示詞綴 (綠字、藍字等)
        item.affixes.forEach(affix => {
            if (affix.type === 'stat') {
                const effectString = affix.effects.map(e => {
                    const statName = e.stat === 'all' ? '全能力' : (STAT_NAMES[e.stat] || e.stat);
                    // 修正：確保負數也能正確顯示
                    const valueString = e.value > 0 ? `+${e.value}` : e.value;
                    return e.type === 'multiplier' ? `${statName} x${e.value}` : `${statName} ${valueString}`;
                }).join(' / '); // 改用斜線分隔，更緊湊
                parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);

            } else if (affix.type === 'proc') {
                // 【優化】顯示更詳細的機率性效果描述
                const procDescMap = {
                    'vampiric': `(${affix.procInfo.value * 100}% 吸血)`,
                    'spiky': `(${affix.procInfo.value * 100}% 反傷)`,
                    'multi_hit': '(機率連擊)',
                    'regenerating': `(每回合恢復 ${affix.procInfo.value * 100}% 生命)`,
                    'blocking': '(機率格擋)',
                    'penetrating': `(${affix.procInfo.value * 100}% 穿透)`
                };
                const procDesc = procDescMap[affix.key] || '(機率性效果)';
                parts.push(`<span class="text-blue-400">${affix.name} ${procDesc}</span>`);
            } else if (affix.type === 'weapon_damage') {
                const effect = affix.effects[0]; // 取得效果設定
                if (effect) {
                    const statName = STAT_NAMES[effect.stat] || effect.stat; // 將 'strength' 轉為 '力量'
                    const percentage = effect.multiplier * 100; // 將 0.3 轉為 30
                    const effectString = `傷害增加 ${percentage}% 有效${statName}`;
                    parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);
                }
            } else if (affix.type === 'proc_rate_enhancer') {
                const effect = affix.effects;
                if (effect) {
                    const effectString = `所有機率性詞綴發動率 +${effect.value}%`;
                    // 使用藍色，與其他機率性詞綴保持一致
                    parts.push(`<span class="text-blue-400">${affix.name}: ${effectString}</span>`);
                }
            }
        });

        // 顯示特殊詛咒詞綴 (紅字)
        if (item.specialAffix) {
            const affixDesc = {
                'strength_curse': '脫力(基礎力=0時+30力, 否則全能力-30)',
                'agility_curse': '遲鈍(基礎敏=0時+30敏, 否則全能力-30)',
                'intelligence_curse': '愚鈍(基礎智=0時+30智, 否則全能力-30)',
                'luck_curse': '不幸(基礎運=0時+30運, 否則全能力-30)',
                'gundam_curse': '肛蛋(基礎2項=0時, 該2項+15, 否則全能力-15)',
                'henshin_curse': '變身(基礎3項=0時, 該3項+10, 否則全能力-10)',
            }[item.specialAffix] || '';
            if (affixDesc) {
                parts.push(`<span class="text-red-400">${affixDesc}</span>`);
            }
        }

        return parts.join('<br>');
    },

    //更新這個計算屬性，讓它排除所有已指派的夥伴
    get availablePartnersForDispatch() {
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
    openDispatchModal() {
        this.modals.dispatch.isOpen = true;
    },
    //技能樹
    openSkillTree() {
        this.modals.skillTree.isOpen = true;
    },
    getSkillStatus(skill) {
        if (!this.player) return 'locked';

        const currentLevel = this.player.learnedSkills[skill.id] || 0;

        // 狀態一：已滿級
        if (skill.maxLevel && currentLevel >= skill.maxLevel) {
            return 'maxed';
        }

        // 計算下一級所需花費
        // 如果是 0 級，則花費是第 1 級的 cost；如果是 1 級，則是第 2 級的 cost，以此類推。
        const nextLevelCost = skill.levels[currentLevel]?.cost; 
        if (nextLevelCost === undefined) {
            return 'locked'; // 如果找不到下一級的資料，視為鎖定
        }

        const canAfford = this.player.skillPoints >= nextLevelCost;
        const dependenciesMet = this.areSkillDependenciesMet(skill);

        // 狀態二：可升級
        if (currentLevel > 0 && canAfford) {
            return 'upgradeable';
        }

        // 狀態三：可學習
        if (currentLevel === 0 && canAfford && dependenciesMet) {
            return 'learnable';
        }

        // 狀態四：已鎖定
        return 'locked';
    },

    getSkillDisplayInfo(skill) {
        if (!this.player) return '';

        const currentLevel = this.player.learnedSkills[skill.id] || 0;
        let infoParts = [];
        
        // --- 提前宣告 effectString，避免 undefined 錯誤 ---
        let effectString = '';

        // --- 顯示當前等級或第一級的效果 ---
        const displayLevel = Math.max(1, currentLevel);
        const levelData = skill.levels[displayLevel - 1];
        
        if (levelData) {
            // --- 根據不同技能的資料結構，獨立處理 ---
            switch (skill.id) {
                case 'combat_powerful_strike':
                    if (levelData.effect) {
                        effectString = (currentLevel > 0 ? `當前效果: ` : `效果: `) + `+${Math.round(levelData.effect.multiplier * 100)}% 力量傷害`;
                    }
                    break;
                case 'combat_quick_cooldown':
                    if (levelData.effect) {
                        effectString = (currentLevel > 0 ? `當前效果: ` : `效果: `) + `-${levelData.effect.value} 回合冷卻`;
                    }
                    break;
                case 'tribe_01':
                    if (levelData.passive !== undefined) {
                        effectString = `被動: +${Math.round(levelData.passive * 100)}% 夥伴屬性加成`;
                    }
                    break;
            }
            if (effectString) infoParts.push(effectString);
        }

        if (skill.baseCooldown) {
            infoParts.push(`冷卻: ${this.player.getFinalCooldown(skill)} 回合`);
        }
        if (skill.baseDuration) {
            const finalDuration = this.player.getFinalDuration(skill);
            infoParts.push(`持續: ${finalDuration} 回合`);
        }
        
        let mainInfo = infoParts.join(' | ');

        // --- 如果技能還沒滿級，則顯示下一級的效果 (維持不變) ---
        if (currentLevel > 0 && currentLevel < skill.maxLevel) {
            const nextLevelData = skill.levels[currentLevel];
            let nextLevelEffect = '';
            switch (skill.id) {
                case 'combat_powerful_strike':
                    nextLevelEffect = `+${Math.round(nextLevelData.effect.multiplier * 100)}%`;
                    break;
                case 'combat_quick_cooldown':
                    nextLevelEffect = `-${nextLevelData.effect.value} 回合`;
                    break;
                case 'tribe_01':
                    nextLevelEffect = `+${Math.round(nextLevelData.passive * 100)}%`;
                    break;
            }
            if (nextLevelEffect) {
                mainInfo += `<br><span class="text-gray-400 text-xs">(下一級: ${nextLevelEffect})</span>`;
            }
        }

        return mainInfo;
    },

    areSkillDependenciesMet(skill) {
        if (!skill.dependencies || skill.dependencies.length === 0) {
            return true;
        }
        return skill.dependencies.every(depId => {
            if (depId === 'post_apostle_boss') {
                return this.flags.defeatedApostle;
            }
            if (depId === 'post_final_boss') {
                return this.flags.defeatedGoddess;
            }
            // 原有的判斷邏輯保留
            return this.player.learnedSkills.hasOwnProperty(depId);
        });
    },

    learnSkill(skillId) {
        const skillTab = Object.keys(SKILL_TREES).find(tab => SKILL_TREES[tab].some(s => s.id === skillId));
        if (!skillTab) return;

        const skill = SKILL_TREES[skillTab].find(s => s.id === skillId);
        if (!skill) return;

        const status = this.getSkillStatus(skill);
        // 只有在「可學習」或「可升級」時才繼續
        if (status !== 'learnable' && status !== 'upgradeable') {
            this.showCustomAlert('不滿足條件！');
            return;
        }
        
        const currentLevel = this.player.learnedSkills[skill.id] || 0;
        const cost = skill.levels[currentLevel].cost;

        // 扣除技能點
        this.player.skillPoints -= cost;

        // 判斷是學習還是升級
        if (currentLevel === 0) {
            // 第一次學習
            this.player.learnedSkills[skill.id] = 1;
            if (skill.combatActive && !this.player.skills.some(s => s.id === skillId)) {
                const newActiveSkill = JSON.parse(JSON.stringify(skill));
                newActiveSkill.currentCooldown = 0;
                this.player.skills.push(newActiveSkill);
            }
            this.logMessage('tribe', `你學會了新技能：[${skill.name}]！`, 'success');
            this.showCustomAlert(`成功學習 [${skill.name}]！`);
        } else {
            // 升級
            this.player.learnedSkills[skill.id]++;
            this.logMessage('tribe', `你的技能 [${skill.name}] 升級了！`, 'success');
            this.showCustomAlert(`[${skill.name}] 已升至 ${this.player.learnedSkills[skill.id]} 級！`);
        }
    },

    assignToDispatch(partnerId, task) {
        // 直接呼叫權威的指派函式
        this.assignPartner(partnerId, task);
    },

    removeFromDispatch(partnerId, task) {
        this.dispatch[task] = this.dispatch[task].filter(id => id !== partnerId);
    },
    
    getGoblinYield(goblin, task) {
        if (!goblin) return 0;

        const totalStats = goblin.getTotalStat('strength', this.isStarving) +
                        goblin.getTotalStat('agility', this.isStarving) +
                        goblin.getTotalStat('intelligence', this.isStarving) +
                        goblin.getTotalStat('luck', this.isStarving);
        
        const equipmentHp = goblin.getEquipmentBonus('hp');
        let yieldAmount = 0;

        switch (task) {
            case 'hunting': {
                const damage = goblin.calculateDamage(this.isStarving);
                yieldAmount = Math.floor(totalStats * 0.2 + damage * 0.2 + equipmentHp * 0.05);
                break;
            }
            case 'logging':
            case 'mining': {
                yieldAmount = Math.floor(totalStats * 0.2 + equipmentHp * 0.05);
                break;
            }
            default:
                return 0;
        }

        // --- 應用「高效採集」技能效果 ---
        const skillId = 'tribe_efficient_gathering';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillLevel = this.player.learnedSkills[skillId];
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            const multiplier = skillData.levels[skillLevel - 1].effect.multiplier;
            yieldAmount = Math.floor(yieldAmount * multiplier);
        }
        
        return yieldAmount;
    },

    calculateDispatchYields() {
        // 升級後的「每日結算」函式，現在它會使用上面的計算機
        const huntingGoblins = this.getDispatchedPartners('hunting');
        const loggingGoblins = this.getDispatchedPartners('logging');
        const miningGoblins = this.getDispatchedPartners('mining');

        const foodGained = huntingGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'hunting'), 0);
        const woodGained = loggingGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'logging'), 0);
        const stoneGained = miningGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'mining'), 0);

        if (foodGained > 0) {
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodGained);
            this.logMessage('tribe', `打獵隊帶回了 ${foodGained} 單位食物。`, 'success');
        }
        if (woodGained > 0) {
            this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodGained);
            this.logMessage('tribe', `伐木隊帶回了 ${woodGained} 單位木材。`, 'success');
        }
        if (stoneGained > 0) {
            this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneGained);
            this.logMessage('tribe', `採礦隊帶回了 ${stoneGained} 單位礦石。`, 'success');
        }
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

    closeDiceModal() {
        if (typeof this.modals.dice.onComplete === 'function') {
            this.modals.dice.onComplete();
        }
        this.modals.dice.isOpen = false;
        this.modals.dice.onComplete = null; // 清理回呼
    },

    // 這是新的視覺化擲骰核心，它只負責“播動畫”，不處理“算結果”
    showDiceRollAnimation(title, playerRolls = [], opponentRolls = []) {
        return new Promise(resolve => {
            // 更新骰子內容
            this.modals.dice.sides.player = playerRolls.map(r => ({ ...r, isRolling: true }));
            this.modals.dice.sides.opponent = opponentRolls.map(r => ({ ...r, isRolling: true }));
            this.modals.dice.title = title;
            
            // 打開骰盤
            this.modals.dice.isOpen = true;
            this.modals.dice.onComplete = resolve; // 設定動畫結束後的回呼

            // 模擬擲骰動畫
            setTimeout(() => {
                // 停止滾動，顯示結果
                this.modals.dice.sides.player.forEach(r => r.isRolling = false);
                this.modals.dice.sides.opponent.forEach(r => r.isRolling = false);
                
                // 讓玩家看清楚結果，再自動關閉
                setTimeout(() => {
                    this.closeDiceModal();
                }, 1000); // 顯示結果後停留 1 秒

            }, 500); // 擲骰動畫持續0. 5 秒
        });
    },

    executeForcedLabor() {
        const skillId = 'tribe_forced_labor';
        if (!this.player.learnedSkills[skillId]) {
            this.showCustomAlert('你尚未學習此技能！');
            return;
        }
        
        if (this.player.tribeSkillCooldowns[skillId] > 0) {
            this.showCustomAlert(`技能冷卻中！還需等待 ${this.player.tribeSkillCooldowns[skillId]} 天。`);
            return;
        }

        const dispatchedGoblinsCount = this.dispatch.hunting.length + this.dispatch.logging.length + this.dispatch.mining.length;
        if (dispatchedGoblinsCount === 0) {
            this.showCustomAlert('目前沒有任何夥伴被派遣，無法使用此技能。');
            return;
        }

        // 1. 執行技能核心效果：結算資源
        this.logMessage('tribe', `你發動了 [強制勞動]，壓榨夥伴們的潛力！`, 'skill');
        this.calculateDispatchYields(); // 直接呼叫現有的結算函式

        // 2. 設定技能冷卻時間
        const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
        const skillLevel = this.player.learnedSkills[skillId];
        const cooldown = skillData.levels[skillLevel - 1].effect.cooldown_override;
        this.player.tribeSkillCooldowns[skillId] = cooldown;
        this.logMessage('tribe', `[強制勞動] 進入冷卻，需等待 ${cooldown} 天。`, 'system');

        this.showCustomAlert('強制勞動完成！資源已立即入庫，夥伴們將繼續執行派遣任務。');
    },
    get filteredRaidInventory() {
        if (!this.player) return [];
        // 直接複用現有的 filterInventory 函式
        return filterInventory(this.player.inventory, this.modals.raidStatus.activeFilter);
    },

};