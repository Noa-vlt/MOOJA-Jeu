const TRICK_REWARDS = {
  air: 10,
  rotation360: 50,
  cutback: 15,
};

const MAX_COMBO = 10;

export function createScoreSystem(onChange) {
  let coins = 0;
  let combo = 1;

  function publish(earned = 0) {
    onChange({ coins, combo, earned });
  }

  return {
    get coins() {
      return coins;
    },
    get combo() {
      return combo;
    },
    award(trickName) {
      const baseReward = TRICK_REWARDS[trickName];
      if (baseReward === undefined) {
        throw new Error(`Unknown trick reward: ${trickName}`);
      }

      const multiplier = combo;
      const earned = baseReward * multiplier;
      coins += earned;
      combo = Math.min(combo + 1, MAX_COMBO);
      publish(earned);

      return { baseReward, multiplier, earned, coins, combo };
    },
    breakCombo() {
      if (combo === 1) return;
      combo = 1;
      publish();
    },
  };
}
