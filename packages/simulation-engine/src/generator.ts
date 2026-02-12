export function poissonSample(lambdaPerTick: number): number {
  if (lambdaPerTick <= 0) return 0;

  // Normal approximation for large lambda
  if (lambdaPerTick > 30) {
    const normal = Math.sqrt(lambdaPerTick) * boxMullerRandom() + lambdaPerTick;
    return Math.max(0, Math.round(normal));
  }

  // Knuth algorithm for small lambda
  const L = Math.exp(-lambdaPerTick);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= Math.random();
  } while (p > L);

  return k - 1;
}

function boxMullerRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
