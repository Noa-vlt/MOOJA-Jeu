const TRICKS = {
  air: { label: 'Air', duration: 0.9 },
  rotation360: { label: 'Rotation 360°', duration: 1.2 },
  cutback: { label: 'Cutback', duration: 1 },
};

export function createTrickSystem(surfer, score, onStatusChange) {
  let activeTrick = null;
  let lastTrick = 'Aucune';

  function publishStatus(message, result) {
    onStatusChange({ message, result, lastTrick });
  }

  return {
    get activeTrick() {
      return activeTrick?.name ?? null;
    },
    perform(name) {
      const trick = TRICKS[name];
      if (!trick) {
        throw new Error(`Unknown trick: ${name}`);
      }
      if (surfer.state !== 'standing') {
        publishStatus('Lève-toi pour tenter une figure.', 'failure');
        return false;
      }
      if (activeTrick) {
        publishStatus('Termine ta figure avant d’en tenter une autre.', 'default');
        return false;
      }

      activeTrick = { name, ...trick, elapsed: 0 };
      surfer.setTrickPose(name, 0);
      publishStatus(`${trick.label} en cours…`, 'active');
      return true;
    },
    update(deltaTime) {
      if (!activeTrick) return;
      if (surfer.state !== 'standing') {
        surfer.setTrickPose(null, 0);
        activeTrick = null;
        return;
      }

      activeTrick.elapsed += deltaTime;
      const progress = Math.min(activeTrick.elapsed / activeTrick.duration, 1);
      surfer.setTrickPose(activeTrick.name, progress);

      if (progress === 1) {
        const { name, label } = activeTrick;
        const reward = score.award(name);
        surfer.setTrickPose(null, 0);
        activeTrick = null;
        lastTrick = label;
        publishStatus(
          `${label} réussi · +${reward.earned} pièces · combo x${reward.multiplier}`,
          'success',
        );
      }
    },
  };
}
