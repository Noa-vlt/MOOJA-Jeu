const STORAGE_KEY = 'mooja-surf-statistics-v1';
const MAX_COMBO = 10;

const EMPTY_STATISTICS = {
  longestRide: 0,
  highestCombo: 1,
  mostCoins: 0,
  totalTricks: 0,
};

export function createStatistics(onChange, onStorageError = () => {}) {
  let statistics = { ...EMPTY_STATISTICS };
  let persistenceAvailable = true;

  try {
    const savedStatistics = localStorage.getItem(STORAGE_KEY);
    if (savedStatistics !== null) {
      try {
        const parsedStatistics = JSON.parse(savedStatistics);
        if (!isValidStatistics(parsedStatistics)) {
          throw new Error('Invalid statistics format');
        }
        statistics = parsedStatistics;
      } catch {
        onStorageError('Les statistiques enregistrées sont illisibles. De nouveaux records seront sauvegardés.');
      }
    }
  } catch {
    persistenceAvailable = false;
    onStorageError('Le stockage local est indisponible. Les statistiques ne seront pas conservées après cette session.');
  }

  function publish() {
    onChange({ ...statistics });
    if (!persistenceAvailable) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statistics));
    } catch {
      persistenceAvailable = false;
      onStorageError('Impossible de sauvegarder les statistiques localement. Elles resteront disponibles jusqu’à la fermeture de cette page.');
    }
  }

  onChange({ ...statistics });

  return {
    recordRide(duration) {
      if (!Number.isFinite(duration) || duration < 0) {
        throw new RangeError('Ride duration must be a non-negative number.');
      }
      if (duration <= statistics.longestRide) return;
      statistics.longestRide = duration;
      publish();
    },
    recordCombo(combo) {
      if (!Number.isInteger(combo) || combo < 1 || combo > MAX_COMBO) {
        throw new RangeError(`Combo must be an integer between 1 and ${MAX_COMBO}.`);
      }
      if (combo <= statistics.highestCombo) return;
      statistics.highestCombo = combo;
      publish();
    },
    recordCoins(coins) {
      if (!Number.isInteger(coins) || coins < 0) {
        throw new RangeError('Coins must be a non-negative integer.');
      }
      if (coins <= statistics.mostCoins) return;
      statistics.mostCoins = coins;
      publish();
    },
    recordTrick() {
      statistics.totalTricks += 1;
      publish();
    },
  };
}

function isValidStatistics(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isFinite(value.longestRide) &&
    value.longestRide >= 0 &&
    Number.isInteger(value.highestCombo) &&
    value.highestCombo >= 1 &&
    value.highestCombo <= MAX_COMBO &&
    Number.isInteger(value.mostCoins) &&
    value.mostCoins >= 0 &&
    Number.isInteger(value.totalTricks) &&
    value.totalTricks >= 0
  );
}
