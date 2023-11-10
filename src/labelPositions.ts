import { bins } from './composables/useBins'

export function* labelPositions(pixels: number, valueMin: number, valueMax: number) {
  const range = valueMax - valueMin
  const valueStep = markerSpan(range)
  const pixelSpan = Math.trunc((pixels * valueStep) / range) - 3
  const firstValue = Math.ceil(valueMin / valueStep) * valueStep // round min up to multiple of span
  const pixelForValue = bins(pixels, valueMin, valueMax).binFor
  if (!pixelForValue) throw new Error('error while using EffectScope.run()')
  for (let value = firstValue; value <= valueMax; value += valueStep) {
    const pixelPosition = pixelForValue(value)
    yield { valueStep, value, pixelPosition, pixelSpan }
  }

  // range = max - min
  // given B, the power of 10 just below range,
  //     range >= 5*B yields spans of width 0.5*B, 10 to 20 spans (5 to 9.9999)/0.5
  // 5 > range >= 2*B yields spans of width 0.2*B, 10 to 25 spans (2 to 4.9999)/0.2
  // 2 > range        yields spans of width 0.1*B, 10 to 20 spans (1 to 1.9999)/0.1
  function markerSpan(range: number) {
    const base = 10 ** Math.trunc(Math.log10(range))
    const factor = range / base
    if (factor >= 5) return 0.5 * base
    else if (factor >= 2) return 0.2 * base
    else return 0.1 * base
  }
}
