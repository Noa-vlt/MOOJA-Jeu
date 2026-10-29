export const SURF_CHARACTERS = [
  {
    id: 'noa',
    name: 'Noa',
    cost: 0,
    description: 'Le surfeur de départ',
    portrait: 'noa.png',
    skin: 0xc98d68,
    wetsuit: 0x254f59,
    board: 0xf0a66f,
  },
  {
    id: 'emilio',
    name: 'Emilio',
    cost: 100,
    description: 'Prêt à prendre le large',
    portrait: 'emilio.png',
    skin: 0xe0a47a,
    wetsuit: 0x3f6288,
    board: 0xf1d36b,
  },
  {
    id: 'malou',
    name: 'Malou',
    cost: 350,
    description: 'À l’aise sur toutes les vagues',
    portrait: 'malou.png',
    skin: 0xb97859,
    wetsuit: 0x6d4669,
    board: 0x8dd3bd,
  },
  {
    id: 'leo',
    name: 'Léo',
    cost: 1000,
    description: 'Le roi du spot',
    portrait: 'leo.png',
    skin: 0xe3b98d,
    wetsuit: 0x344a43,
    board: 0xe67f62,
  },
];

const STORAGE_KEY = 'mooja-surf-character-progress-v1';
const CHARACTER_IDS = new Set(SURF_CHARACTERS.map(({ id }) => id));

export function createCharacterProgress(onChange = () => {}) {
  const saved = loadProgress();
  let totalCoins = saved.progress.totalCoins;
  let unlockedCharacters = saved.progress.unlockedCharacters;
  let selectedCharacter = saved.progress.selectedCharacter;
  let persistenceAvailable = saved.persistenceAvailable;

  function getState() {
    return {
      totalCoins,
      unlockedCharacters: [...unlockedCharacters],
      selectedCharacter,
    };
  }

  function publish(message = '') {
    onChange(getState(), message);
    if (!persistenceAvailable) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          totalCoins,
          unlockedCharacters,
          selectedCharacter,
        }),
      );
    } catch {
      persistenceAvailable = false;
      onChange(
        getState(),
        'Impossible de sauvegarder les pièces et personnages sur cet appareil.',
      );
    }
  }

  onChange(getState(), saved.warning);

  return {
    getState,
    addCoins(amount) {
      if (!Number.isInteger(amount) || amount < 0) {
        throw new RangeError('Coins must be a non-negative integer.');
      }
      if (amount === 0) return;
      if (!Number.isSafeInteger(totalCoins + amount)) {
        throw new RangeError('Total coins exceed the safe integer range.');
      }
      totalCoins += amount;
      publish();
    },
    selectCharacter(id) {
      const character = getCharacter(id);
      if (!unlockedCharacters.includes(id)) {
        publish(`${character.name} doit d’abord être débloqué.`);
        return false;
      }
      selectedCharacter = id;
      publish(`${character.name} est sélectionné.`);
      return true;
    },
    unlockCharacter(id) {
      const character = getCharacter(id);
      if (unlockedCharacters.includes(id)) {
        selectedCharacter = id;
        publish(`${character.name} est sélectionné.`);
        return true;
      }
      if (totalCoins < character.cost) {
        publish(
          `Il te manque ${character.cost - totalCoins} pièces pour débloquer ${character.name}.`,
        );
        return false;
      }
      totalCoins -= character.cost;
      unlockedCharacters.push(id);
      selectedCharacter = id;
      publish(`${character.name} est débloqué et sélectionné !`);
      return true;
    },
  };
}

function getCharacter(id) {
  const character = SURF_CHARACTERS.find((entry) => entry.id === id);
  if (!character) throw new RangeError(`Unknown surf character: ${id}`);
  return character;
}

function loadProgress() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return {
        progress: {
          totalCoins: 0,
          unlockedCharacters: ['noa'],
          selectedCharacter: 'noa',
        },
        persistenceAvailable: true,
        warning: '',
      };
    }

    const parsed = JSON.parse(saved);
    if (!isValidProgress(parsed)) throw new Error('Invalid character progress');
    return {
      progress: parsed,
      persistenceAvailable: true,
      warning: '',
    };
  } catch {
    return {
      progress: {
        totalCoins: 0,
        unlockedCharacters: ['noa'],
        selectedCharacter: 'noa',
      },
      persistenceAvailable: false,
      warning:
        'Progression illisible ou stockage local indisponible : pièces et déblocages ne seront pas conservés.',
    };
  }
}

function isValidProgress(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isSafeInteger(value.totalCoins) &&
    value.totalCoins >= 0 &&
    Array.isArray(value.unlockedCharacters) &&
    value.unlockedCharacters.length > 0 &&
    value.unlockedCharacters.every(
      (id) => typeof id === 'string' && CHARACTER_IDS.has(id),
    ) &&
    new Set(value.unlockedCharacters).size === value.unlockedCharacters.length &&
    value.unlockedCharacters.includes('noa') &&
    typeof value.selectedCharacter === 'string' &&
    value.unlockedCharacters.includes(value.selectedCharacter)
  );
}
