// 程序化世界生成 + 存档
import { BLOCK } from './blocks.js'

export const WORLD_W = 320
export const WORLD_H = 140

// 简单可复现的伪随机数（xorshift32）
export function makeRng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

// 一维值噪声 + 多倍频，用于地表起伏
function makeNoise1D(rng, smoothness) {
  const points = new Map()
  return (x) => {
    const i = Math.floor(x / smoothness)
    const t = (x - i * smoothness) / smoothness
    const get = (k) => {
      if (!points.has(k)) points.set(k, rng())
      return points.get(k)
    }
    const a = get(i)
    const b = get(i + 1)
    const f = t * t * (3 - 2 * t)
    return a + (b - a) * f
  }
}

export function createWorld(seed = Math.floor(Math.random() * 1e9)) {
  const rng = makeRng(seed)
  const n1 = makeNoise1D(rng, 26)
  const n2 = makeNoise1D(rng, 9)
  const n3 = makeNoise1D(rng, 3)

  const data = new Uint8Array(WORLD_W * WORLD_H)
  const idx = (x, y) => y * WORLD_W + x
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return
    data[idx(x, y)] = v
  }
  const get = (x, y) => {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return BLOCK.STONE
    return data[idx(x, y)]
  }

  // 地表高度线
  const surface = new Int16Array(WORLD_W)
  for (let x = 0; x < WORLD_W; x++) {
    const h = 46 + (n1(x) - 0.5) * 18 + (n2(x) - 0.5) * 7 + (n3(x) - 0.5) * 2
    surface[x] = Math.max(24, Math.min(WORLD_H - 30, Math.round(h)))
  }

  // 填充地层
  for (let x = 0; x < WORLD_W; x++) {
    const top = surface[x]
    for (let y = top; y < WORLD_H; y++) {
      const depth = y - top
      let block
      if (depth === 0) block = BLOCK.GRASS
      else if (depth < 5) block = BLOCK.DIRT
      else block = BLOCK.STONE
      set(x, y, block)
    }
    // 洞穴
    for (let y = top + 6; y < WORLD_H - 4; y++) {
      const cave = n2(x * 3.1 + y * 1.7) * 0.6 + n3(x * 0.7 + y * 2.3) * 0.4
      if (cave > 0.66 && get(x, y) === BLOCK.STONE) set(x, y, BLOCK.AIR)
    }
  }

  // 矿石
  const oreVein = (block, count, minDepth, maxDepth, size) => {
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(rng() * WORLD_W)
      const top = surface[cx]
      const cy = Math.floor(top + minDepth + rng() * Math.max(1, maxDepth - minDepth))
      for (let k = 0; k < size; k++) {
        const ox = cx + Math.floor((rng() - 0.5) * 3)
        const oy = cy + Math.floor((rng() - 0.5) * 3)
        if (get(ox, oy) === BLOCK.STONE) set(ox, oy, block)
      }
    }
  }
  oreVein(BLOCK.COAL, 190, 6, WORLD_H, 6)
  oreVein(BLOCK.IRON, 110, 20, WORLD_H, 5)
  oreVein(BLOCK.GOLD, 45, 45, WORLD_H, 4)

  // 沙子（地表低洼处）
  for (let x = 0; x < WORLD_W; x++) {
    const top = surface[x]
    if (n1(x * 0.5) > 0.62) {
      for (let y = top; y < top + 4; y++) set(x, y, BLOCK.SAND)
    }
  }

  // 树木
  const plantTree = (x) => {
    const top = surface[x]
    if (get(x, top) !== BLOCK.GRASS) return
    const h = 5 + Math.floor(rng() * 5)
    for (let i = 1; i <= h; i++) set(x, top - i, BLOCK.WOOD)
    const crownY = top - h
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        if (Math.abs(dx) === 2 && dy === 1) continue
        if (dx === 0 && dy === 1) continue
        if (get(x + dx, crownY + dy) === BLOCK.AIR) set(x + dx, crownY + dy, BLOCK.LEAF)
      }
    }
  }
  for (let x = 3; x < WORLD_W - 3; x += 4 + Math.floor(rng() * 6)) {
    if (rng() > 0.28) plantTree(x)
  }

  // 出生点：地表正中偏左，清出站立空间
  const spawnX = Math.floor(WORLD_W / 2)
  const spawnY = surface[spawnX] - 1
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = 0; dy < 3; dy++) set(spawnX + dx, spawnY - dy, BLOCK.AIR)
  }

  return {
    seed,
    data,
    surface,
    spawn: { x: spawnX, y: spawnY },
    width: WORLD_W,
    height: WORLD_H,
  }
}

const SAVE_KEY = 'block-core-save-v1'

export function saveWorld(world, player, inventory, elapsedMs) {
  try {
    const payload = {
      version: 1,
      seed: world.seed,
      // 只存与初始生成的差异，避免存档过大
      diff: collectDiff(world),
      player,
      inventory,
      elapsedMs,
      savedAt: Date.now(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function collectDiff(world) {
  const base = createWorld(world.seed)
  const diff = []
  for (let i = 0; i < world.data.length; i++) {
    if (world.data[i] !== base.data[i]) diff.push(i, world.data[i])
  }
  return diff
}

export function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const payload = JSON.parse(raw)
    if (!payload || payload.version !== 1) return null
    const world = createWorld(payload.seed)
    const diff = payload.diff || []
    for (let i = 0; i < diff.length; i += 2) world.data[diff[i]] = diff[i + 1]
    return {
      world,
      player: payload.player,
      inventory: payload.inventory,
      elapsedMs: payload.elapsedMs || 0,
    }
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
