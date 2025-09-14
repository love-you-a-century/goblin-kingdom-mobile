// js/modules/tribe.js

const tribeModule = {
    getBuildingUpgradeCost(type) {
        const building = this.buildings[type];
        if (!building) return { food: 0, wood: 0, stone: 0 };
        const level = building.level;
        const multiplier = Math.pow(2, level);
        let cost = { food: 0, wood: 0, stone: 0 };

        switch (type) {
            case 'dungeon':
                if (level >= 5) return { food: Infinity, wood: Infinity, stone: Infinity };
                const dungeonCosts = [100, 200, 400, 800, 1600];
                const resourceCost = dungeonCosts[level];
                cost = { food: resourceCost, wood: resourceCost, stone: resourceCost };
                break;
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
        const maxLevels = { dungeon: 6, warehouse: 6, barracks: 5, armory: 4, merchantCamp: 4 };
        if (building.level >= maxLevels[type]) { this.showCustomAlert(`${building.name}已達到最大等級！`); return; }
        if (!this.canAffordBuildingUpgrade(type)) { this.showCustomAlert("資源不足！"); return; }
        
        const cost = this.getBuildingUpgradeCost(type);
        this.resources.food -= (cost.food || 0);
        this.resources.wood -= cost.wood;
        this.resources.stone -= cost.stone;
        building.level++;
        this.logMessage('tribe', `${building.name}${building.level === 1 ? '建造完成' : `升級至 ${building.level} 級`}！`, 'success');
    },

    executeTraining(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner || partner.hasBeenTrained) {
            this.showCustomAlert("此夥伴無法被訓練。");
            return;
        }

        const playerFoodCost = this.getUnitFoodConsumption(this.player);
        const partnerFoodCost = this.getUnitFoodConsumption(partner);
        const totalFoodCost = playerFoodCost + partnerFoodCost;

        if (this.resources.food < totalFoodCost) {
            this.showCustomAlert(`食物不足！本次訓練需要 ${totalFoodCost} 單位食物。`);
            return;
        }

        const pointsGained = this.potentialTrainingPoints;
        if (pointsGained <= 0) {
            this.showCustomAlert("以王您現在的狀態，無法為夥伴帶來任何提升。");
            return;
        }

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
        partner.updateHp(this.isStarving);

        this.logMessage('tribe', `你對 ${partner.name} 進行了嚴格的訓練！`, 'player');
        const logDetails = Object.entries(pointDistributionLog)
            .filter(([stat, value]) => value > 0)
            .map(([stat, value]) => `${STAT_NAMES[stat]} +${value}`)
            .join(', ');
        this.logMessage('tribe', `${partner.name} 的潛力被激發了：${logDetails}。`, 'success');
        
        this.showCustomAlert(`${partner.name} 的訓練完成了！\n獲得的能力提升：\n${logDetails}`);

        this.checkAndProcessDecisions();
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

        const skillId = 'tribe_efficient_gathering';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillLevel = this.player.learnedSkills[skillId];
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            const multiplier = skillData.levels[skillLevel - 1].effect.multiplier;
            yieldAmount = Math.floor(yieldAmount * multiplier);
        }
        
        return yieldAmount;
    },

    calculateDispatchYields(triggerEncounters = true) {
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
        if (triggerEncounters) {
            this.checkForDlcEncounters();
        }
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

        this.logMessage('tribe', `你發動了 [強制勞動]，壓榨夥伴們的潛力！`, 'skill');
        this.calculateDispatchYields(false);

        const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
        const skillLevel = this.player.learnedSkills[skillId];
        const cooldown = skillData.levels[skillLevel - 1].effect.cooldown_override;
        this.player.tribeSkillCooldowns[skillId] = cooldown;
        this.logMessage('tribe', `[強制勞動] 進入冷卻，需等待 ${cooldown} 天。`, 'system');

        this.showCustomAlert('強制勞動完成！資源已立即入庫，夥伴們將繼續執行派遣任務。');
    },
    checkForDlcEncounters() {
        if (this.screen === 'combat') return; // 如果正在戰鬥中，則不觸發

        const dispatchTasks = [
            { task: 'logging', chance: this.dispatch.logging.length, race: 'elf', unlockedFlag: 'elf_tribe_unlocked' },
            { task: 'hunting', chance: this.dispatch.hunting.length, race: 'beastkin', unlockedFlag: 'beastkin_tribe_unlocked' }
        ];

        for (const encounter of dispatchTasks) {
            if (events.length > 0) break; 
            if (encounter.chance > 0 && !this.dlc[encounter.unlockedFlag] && rollPercentage(encounter.chance)) {
                
                let enemyUnit;
                let tribeName = '';
                let alertMessage = '';

                if (encounter.race === 'elf') {
                    const totalStatPoints = randomInt(120, 190);
                    enemyUnit = new MaleHuman('精靈遊俠', distributeStatsWithRatio(totalStatPoints, HIGH_ELF_GUARDS['精靈遊俠'].ratio), '精靈遊俠', 'easy', 'elf');
                    this.equipEnemy(enemyUnit, 'normal'); 
                    tribeName = '銀月森林';
                    alertMessage = `你的伐木隊在森林深處遭遇了一名警惕的精靈遊俠！`;
                } else if (encounter.race === 'beastkin') {
                    const totalStatPoints = randomInt(120, 190);
                    enemyUnit = new MaleHuman('亞獸人武鬥家', distributeStatsWithRatio(totalStatPoints, BEASTKIN_CHAMPIONS['亞獸人戰士'].ratio), '亞獸人武鬥家', 'easy', 'beastkin');
                    this.equipEnemy(enemyUnit, 'normal');
                    tribeName = '咆哮平原';
                    alertMessage = `你的狩獵隊在平原上驚動了一位正在磨練技藝的亞獸人武鬥家！`;
                }

                if (enemyUnit) {
                    this.showCustomAlert(alertMessage, () => {
                        this.combat.isUnescapable = true;
                        
                        // 設定一個旗標，標記這是一場DLC遭遇戰
                        this.combat.isDlcEncounterBattle = true; 

                        this.combat.onVictoryCallback = () => {
                        // 無論玩家是否有DLC，都在勝利後將一個待辦事項加入佇列
                        this.pendingDecisions.push({
                            type: 'dlc_prompt', // 新增一個待辦事項類型
                            context: {
                                hasDlc: this.dlc.races_of_aetheria,
                                unlockedFlag: encounter.unlockedFlag,
                                tribeName: tribeName
                            }
                        });
                        this.combat.onVictoryCallback = null; // 清理回呼
                    };
                    this.startCombat([enemyUnit], true);
                    });
                    return;
                }
            }
        }
    },
};