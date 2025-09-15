// js/modules/skill.js

const skillModule = {
    getSkillStatus(skill) {
        if (!this.player) return 'locked';

        const currentLevel = this.player.learnedSkills[skill.id] || 0;

        if (skill.maxLevel && currentLevel >= skill.maxLevel) {
            return 'maxed';
        }

        const nextLevelCost = skill.levels[currentLevel]?.cost; 
        if (nextLevelCost === undefined) {
            return 'locked';
        }

        const canAfford = this.player.skillPoints >= nextLevelCost;
        const dependenciesMet = this.areSkillDependenciesMet(skill);

        if (currentLevel > 0 && canAfford) {
            return 'upgradeable';
        }
        if (currentLevel === 0 && canAfford && dependenciesMet) {
            return 'learnable';
        }

        return 'locked';
    },

    getSkillDisplayInfo(skill) {
        if (!this.player) return '';
        const currentLevel = this.player.learnedSkills[skill.id] || 0;
        let effectParts = [];

        // --- Part 1: 產生「當前/基礎效果」的描述文字 ---
        if (currentLevel > 0) {
            const levelData = skill.levels[currentLevel - 1];
            let effectString = '當前效果: ';
            const effect = levelData.effect;

            switch (skill.id) {
                // --- 戰鬥技能 ---
                case 'combat_powerful_strike':
                case 'combat_agile_strike':
                case 'combat_enchanted_strike':
                case 'combat_lucky_strike':
                    effectString += `+${Math.round(effect.multiplier * 100)}% ${STAT_NAMES[effect.stat || 'strength']}傷害`;
                    break;
                case 'combat_symbiosis':
                    effectString += `傷害減免 ${effect.damageReduction * 100}%`;
                    break;
                case 'combat_kings_pressure':
                    effectString += `每位夥伴降低敵人 ${effect.debuff_per_partner * 100}% 全能力`;
                    break;
                case 'combat_quick_cooldown':
                    effectString += `技能冷卻 -${effect.value} 回合`;
                    break;
                case 'tribe_01': // 集團戰略
                    effectString += `+${Math.round(levelData.passive * 100)}% 夥伴屬性加成`;
                    break;
                // --- 部落技能 ---
                case 'tribe_forced_labor':
                    effectString = `當前冷卻: ${effect.cooldown_override} 天`;
                    break;
                case 'tribe_efficient_gathering':
                    effectString += `派遣資源量 +${Math.round((effect.multiplier - 1) * 100)}%`;
                    break;
                case 'tribe_architecture':
                    effectString += `建築成本 -${Math.round(effect.cost_reduction * 100)}%`;
                    break;
                case 'tribe_negotiation':
                    effectString += `商品價值 -${Math.round(effect.price_reduction * 100)}%`;
                    break;
                // --- 掠奪技能 ---
                case 'raid_deep_scavenging':
                    effectString += `搜刮資源量 +${Math.round((effect.multiplier - 1) * 100)}%`;
                    break;
                case 'raid_dispersed_escape':
                    effectString += `潛行懲罰 -${Math.round(effect.penalty_reduction * 100)}%`;
                    break;
                // --- 繁衍技能 ---
                case 'breed_vigorous':
                    effectString = `可恢復 ${effect.charges} 次繁衍次數`;
                    break;
                case 'breed_eugenics':
                    effectString += `${Math.round(effect.chance * 100)}% 機率獲得額外能力`;
                    break;
                case 'breed_polyspermy':
                    effectString = `${effect.twins_chance * 100}%機率雙胞胎` + (effect.triplets_chance ? `, ${effect.triplets_chance * 100}%機率三胞胎` : '');
                    break;
                // --- 權能/單級技能 ---
                default:
                     // 對於沒有效果數值的單級技能，直接顯示描述
                    effectString = skill.description;
                    break;
            }
            effectParts.push(`<span class="text-cyan-400 font-semibold">${effectString}</span>`);
        }

        // --- Part 2: 產生「下一級效果」的描述文字 ---
        if (currentLevel > 0 && currentLevel < skill.maxLevel) {
            const nextLevelData = skill.levels[currentLevel];
            const effect = nextLevelData.effect;
            let nextLevelString = '';

            switch (skill.id) {
                case 'combat_powerful_strike':
                case 'combat_agile_strike':
                case 'combat_enchanted_strike':
                case 'combat_lucky_strike':
                    nextLevelString = `+${Math.round(effect.multiplier * 100)}%`;
                    break;
                case 'combat_symbiosis':
                    nextLevelString = `${effect.damageReduction * 100}% 減傷`;
                    break;
                case 'combat_kings_pressure':
                    nextLevelString = `${effect.debuff_per_partner * 100}%`;
                    break;
                case 'combat_quick_cooldown':
                    nextLevelString = `-${effect.value} 回合`;
                    break;
                case 'tribe_01':
                    nextLevelString = `+${Math.round(nextLevelData.passive * 100)}%`;
                    break;
                case 'tribe_forced_labor':
                    nextLevelString = `${effect.cooldown_override} 天冷卻`;
                    break;
                case 'tribe_efficient_gathering':
                    nextLevelString = `+${Math.round((effect.multiplier - 1) * 100)}%`;
                    break;
                case 'tribe_architecture':
                    nextLevelString = `-${Math.round(effect.cost_reduction * 100)}%`;
                    break;
                case 'tribe_negotiation':
                    nextLevelString = `-${Math.round(effect.price_reduction * 100)}%`;
                    break;
                case 'raid_deep_scavenging':
                    nextLevelString = `+${Math.round((effect.multiplier - 1) * 100)}%`;
                    break;
                case 'raid_dispersed_escape':
                    nextLevelString = `-${Math.round(effect.penalty_reduction * 100)}%`;
                    break;
                case 'breed_vigorous':
                    nextLevelString = `恢復 ${effect.charges} 次`;
                    break;
                case 'breed_eugenics':
                    nextLevelString = `${Math.round(effect.chance * 100)}% 機率`;
                    break;
                case 'breed_polyspermy':
                    nextLevelString = `${effect.twins_chance * 100}%雙胞胎` + (effect.triplets_chance ? `, ${effect.triplets_chance * 100}%三胞胎` : '');
                    break;
            }
            if (nextLevelString) {
                effectParts.push(`<span class="text-gray-400 text-xs">(下一級: ${nextLevelString})</span>`);
            }
        }
        
        // --- Part 3: 組合最終顯示文字 ---
        let mainInfo = effectParts.join('<br>');

        // 只為戰鬥技能顯示由智力計算後的冷卻/持續時間
        if (skill.combatActive) {
            let details = [];
            if (skill.baseCooldown) {
                details.push(`冷卻: ${this.player.getFinalCooldown(skill)} 回合`);
            }
            if (skill.baseDuration) {
                details.push(`持續: ${this.player.getFinalDuration(skill)} 回合`);
            }
            if(details.length > 0) {
                 // 如果已經有效果文字，則換行顯示；否則直接顯示
                mainInfo += (mainInfo ? '<br>' : '') + `<span class="text-sm">${details.join(' | ')}</span>`;
            }
        }

        return mainInfo;
    },

    areSkillDependenciesMet(skill) {
        if (!skill.dependencies || skill.dependencies.length === 0) {
            return true;
        }
        return skill.dependencies.every(depId => {
            if (depId === 'post_apostle_boss') return this.flags.defeatedApostle;
            if (depId === 'post_final_boss') return this.flags.defeatedGoddess;
            return this.player.learnedSkills.hasOwnProperty(depId);
        });
    },

    learnSkill(skillId) {
        const skillTab = Object.keys(SKILL_TREES).find(tab => SKILL_TREES[tab].some(s => s.id === skillId));
        if (!skillTab) return;

        const skill = SKILL_TREES[skillTab].find(s => s.id === skillId);
        if (!skill) return;

        const status = this.getSkillStatus(skill);
        if (status !== 'learnable' && status !== 'upgradeable') {
            this.showCustomAlert('不滿足條件！');
            return;
        }
        
        const currentLevel = this.player.learnedSkills[skill.id] || 0;
        const cost = skill.levels[currentLevel].cost;

        this.player.skillPoints -= cost;

        if (currentLevel === 0) {
            this.player.learnedSkills[skill.id] = 1;
            if (skill.combatActive && !this.player.skills.some(s => s.id === skillId)) {
                const newActiveSkill = JSON.parse(JSON.stringify(skill));
                newActiveSkill.currentCooldown = 0;
                this.player.skills.push(newActiveSkill);
            }
            this.logMessage('tribe', `你學會了新技能：[${skill.name}]！`, 'success');
            this.showCustomAlert(`成功學習 [${skill.name}]！`);
        } else {
            this.player.learnedSkills[skill.id]++;
            this.logMessage('tribe', `你的技能 [${skill.name}] 升級了！`, 'success');
            this.showCustomAlert(`[${skill.name}] 已升至 ${this.player.learnedSkills[skill.id]} 級！`);
        }
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
};