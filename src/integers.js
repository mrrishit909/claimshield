// Checked integer arithmetic. Pure, isomorphic ESM (no node: imports).

export const MAX_SAFE = Number.MAX_SAFE_INTEGER;
export const OVERFLOW_CODE = 'AGGREGATE_AMOUNT_OVERFLOW';

export function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Add nonnegative b to nonnegative a. Throws an error carrying
 * code AGGREGATE_AMOUNT_OVERFLOW unless both are safe integers and
 * b <= Number.MAX_SAFE_INTEGER - a.
 */
export function checkedAdd(a, b) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    a < 0 ||
    b < 0 ||
    b > MAX_SAFE - a
  ) {
    const err = new Error(`checked addition overflow: ${String(a)} + ${String(b)}`);
    err.code = OVERFLOW_CODE;
    throw err;
  }
  return a + b;
}

/**
 * Sum a list of amounts with checked addition.
 * Returns {ok:true,total} or {ok:false,error:{code,path,message}}.
 * pathFor(index) builds the error path for the offending element.
 */
export function sumChecked(values, pathFor = (i) => `claims[${i}].amountCents`) {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    try {
      total = checkedAdd(total, values[i]);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: OVERFLOW_CODE,
          path: pathFor(i),
          message:
            `Adding ${String(values[i])} to running total ${String(total)} would exceed ` +
            `Number.MAX_SAFE_INTEGER (${MAX_SAFE}); the whole batch is rejected and no findings are produced.`,
        },
      };
    }
  }
  return { ok: true, total };
}
