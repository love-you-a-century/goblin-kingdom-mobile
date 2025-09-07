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
        let infoParts = [];
        let effectString = '';
        const displayLevel = Math.max(1, currentLevel);
        const levelData = skill.levels[displayLevel - 1];
        
        if (levelData) {
            switch (skill.id) {
                case 'combat_powerful_strike':
                case 'combat_agile_strike':
                case 'combat_enchanted_strike':
                case 'combat_lucky_strike':
                    if (levelData.effect) {
                        effectString = (currentLevel > 0 ? `當前效果: ` : `效果: `) + `+${Math.round(levelData.effect.multiplier * 100)}% ${STAT_NAMES[levelData.effect.stat || 'strength']}傷害`;
                    }
                    break;
                case 'combat_symbiosis':
                    if (levelData.effect) {
                         effectString = (currentLevel > 0 ? `當前效果: ` : `效果: `) + `傷害減免 ${levelData.effect.damageReduction * 100}%`;
                    }
                    break;
                case 'combat_kings_pressure':
                     if (levelData.effect) {
                        effectString = (currentLevel > 0 ? `當前效果: ` : `效果: `) + `每位夥伴降低敵人 ${levelData.effect.debuff_per_partner * 100}% 全能力`;
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
                // ... 其他技能的顯示邏輯 ...
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

        if (currentLevel > 0 && currentLevel < skill.maxLevel) {
            const nextLevelData = skill.levels[currentLevel];
            let nextLevelEffect = '';
            // 簡化下一級效果的顯示
            if(nextLevelData.effect) {
                 if (nextLevelData.effect.multiplier) nextLevelEffect = `+${Math.round(nextLevelData.effect.multiplier * 100)}%`;
                 else if (nextLevelData.effect.value) nextLevelEffect = `-${nextLevelData.effect.value} 回合`;
                 else if (nextLevelData.effect.damageReduction) nextLevelEffect = `${nextLevelData.effect.damageReduction * 100}% 減傷`;
            } else if (nextLevelData.passive) {
                 nextLevelEffect = `+${Math.round(nextLevelData.passive * 100)}%`;
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