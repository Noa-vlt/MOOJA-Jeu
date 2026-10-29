export function createFollowCamera(THREE, camera, target) {
  const cameraOffset = new THREE.Vector3(0, 5.2, 11);
  const lookOffset = new THREE.Vector3(0, 0.9, -1.5);
  const desiredPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  camera.position
    .copy(cameraOffset)
    .applyQuaternion(target.quaternion)
    .add(target.position);
  lookTarget
    .copy(lookOffset)
    .applyQuaternion(target.quaternion)
    .add(target.position);
  camera.lookAt(lookTarget);

  return {
    update(deltaTime) {
      desiredPosition
        .copy(cameraOffset)
        .applyQuaternion(target.quaternion)
        .add(target.position);
      const followAmount = 1 - Math.exp(-5 * deltaTime);
      camera.position.lerp(desiredPosition, followAmount);

      lookTarget
        .copy(lookOffset)
        .applyQuaternion(target.quaternion)
        .add(target.position);
      camera.lookAt(lookTarget);
    },
  };
}
