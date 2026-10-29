const WEATHER = {
  sunny: { label: 'Soleil', difficulty: -0.3 },
  cloudy: { label: 'Nuageux', difficulty: 0.2 },
  fog: { label: 'Brouillard', difficulty: 0.35 },
  storm: { label: 'Tempête', difficulty: 0.7 },
  sunset: { label: 'Coucher de soleil', difficulty: -0.1 },
};

const WEATHER_NAMES = Object.keys(WEATHER);
const MIN_DURATION = 18;
const MAX_DURATION = 27;

export function createWeather(random = Math.random) {
  let condition = 'sunny';
  let remaining = randomBetween(random, MIN_DURATION, MAX_DURATION);
  let difficultyModifier = WEATHER.sunny.difficulty;
  let order = [];
  let orderIndex = 0;

  function chooseNextCondition() {
    if (orderIndex >= order.length) {
      order = [...WEATHER_NAMES].filter((name) => name !== condition);
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
      }
      orderIndex = 0;
    }

    condition = order[orderIndex];
    orderIndex += 1;
  }

  return {
    update(deltaTime) {
      remaining -= deltaTime;
      if (remaining <= 0) {
        chooseNextCondition();
        remaining += randomBetween(random, MIN_DURATION, MAX_DURATION);
      }

      const targetDifficulty = WEATHER[condition].difficulty;
      difficultyModifier +=
        (targetDifficulty - difficultyModifier) * (1 - Math.exp(-0.35 * deltaTime));

      return {
        condition,
        label: WEATHER[condition].label,
        difficultyModifier,
        timeUntilChange: Math.max(0, remaining),
      };
    },
    get difficultyModifier() {
      return difficultyModifier;
    },
  };
}

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}
