// 游戏主循环：输入、物理、挖掘/放置、HUD、存档
import { BLOCK, BLOCK_META, HOTBAR, TILE } from './blocks.js'
import { clearSave, createWorld, loadWorld, saveWorld } from './world.js'
import { Renderer } from './renderer.js'

const canvas = document.getElementById('world')
const hotbarEl = document.getElementById('hotbar')
const invEl = document.getElementById('inventory-list')
const hudPos = document.getElementById('hud-pos')
const hudDepth = document.getElementById('hud-depth')
const hudTime = document.getElementById('hud-time')
const hudFps = document.getElementById('hud-fps')

const GRAVITY = 0.55
const MOVE_SPEED = 3.0
const JUMP_SPEED = -9.2
const MAX_FALL = 14
const REACH = 5
const DAY_LENGTH_MS = 240000 // 一昼夜 4 分钟

const saved = loadWorld()
const world = saved ? saved.world : createWorld()
const renderer = new Renderer(canvas, world)

const player = saved?.player ?? {
  x: world.spawn.x * TILE,
  y: (world.spawn.y - 1) * TILE,
  w: 10,
  h: 20,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
}
if (!Number.isFinite(player.x)) {
  player.x = world.spawn.x * TILE
  player.y = (world.spawn.y - 1) * TILE
}
player.vx = 0
player.vy = 0

const inventory = saved?.inventory ?? { [BLOCK.DIRT]: 40, [BLOCK.STONE]: 20, [BLOCK.PLANK]: 16, [BLOCK.TORCH]: 8 }
let elapsedMs = saved?.elapsedMs ?? DAY_LENGTH_MS / 12 // 默认从上午 08:00 开始
let selectedIndex = 0

const keys = new Set()
const mouse = { x: 0, y: 0, left: false, right: false }

// ---------- 快捷栏 / 背包 UI ----------
function blockSwatch(block) {
  const meta = BLOCK_META[block]
  return meta ? meta.color : '#666'
}

function renderHotbar() {
  hotbarEl.innerHTML = ''
  HOTBAR.forEach((block, index) => {
    const slot = document.createElement('div')
    slot.className = 'slot' + (index === selectedIndex ? ' active' : '')
    slot.title = BLOCK_META[block]?.name ?? ''
    slot.innerHTML = `
      <span class="key">${index + 1}</span>
      <span class="swatch" style="background:${blockSwatch(block)}"></span>
      <span class="count">${inventory[block] ?? 0}</span>
    `
    slot.addEventListener('click', () => {
      selectedIndex = index
      renderHotbar()
    })
    hotbarEl.appendChild(slot)
  })
}

function renderInventory() {
  const entries = Object.entries(inventory).filter(([, n]) => n > 0)
  if (entries.length === 0) {
    invEl.innerHTML = '<div class="inv-row"><span class="name">背包是空的</span></div>'
    return
  }
  invEl.innerHTML = entries
    .map(([block, n]) => {
      const b = Number(block)
      return `<div class="inv-row">
        <span class="name"><span class="dot" style="background:${blockSwatch(b)}"></span>${BLOCK_META[b]?.name ?? b}</span>
        <span class="num">${n}</span>
      </div>`
    })
    .join('')
}

// ---------- 世界读写 ----------
function getBlock(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return BLOCK.STONE
  return world.data[ty * world.width + tx]
}

function setBlock(tx, ty, block) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return
  world.data[ty * world.width + tx] = block
}

function isSolid(tx, ty) {
  const b = getBlock(tx, ty)
  if (b === BLOCK.AIR || b === BLOCK.WATER || b === BLOCK.TORCH) return false
  return Boolean(BLOCK_META[b]?.solid)
}

// ---------- 物理 ----------
function rectCollides(x, y, w, h) {
  const x0 = Math.floor(x / TILE)
  const x1 = Math.floor((x + w - 1) / TILE)
  const y0 = Math.floor(y / TILE)
  const y1 = Math.floor((y + h - 1) / TILE)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolid(tx, ty)) return true
    }
  }
  return false
}

function updatePlayer(dt) {
  const left = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')
  const wantJump = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp')

  player.vx = 0
  if (left) {
    player.vx = -MOVE_SPEED
    player.facing = -1
  }
  if (right) {
    player.vx = MOVE_SPEED
    player.facing = 1
  }

  if (wantJump && player.onGround) {
    player.vy = JUMP_SPEED
    player.onGround = false
  }

  player.vy = Math.min(MAX_FALL, player.vy + GRAVITY)

  // 水平移动 + 碰撞
  const nextX = player.x + player.vx
  if (!rectCollides(nextX, player.y, player.w, player.h)) {
    player.x = nextX
  } else if (player.vx !== 0) {
    // 尝试自动上一格（跳过台阶）
    const stepY = player.y - TILE
    if (!rectCollides(nextX, stepY, player.w, player.h)) {
      player.y = stepY
      player.x = nextX
    }
  }

  // 垂直移动 + 碰撞
  const nextY = player.y + player.vy
  if (!rectCollides(player.x, nextY, player.w, player.h)) {
    player.y = nextY
    player.onGround = false
  } else {
    if (player.vy > 0) player.onGround = true
    player.vy = 0
  }

  // 边界
  player.x = Math.max(0, Math.min(world.width * TILE - player.w, player.x))
  if (player.y > world.height * TILE) {
    player.x = world.spawn.x * TILE
    player.y = (world.spawn.y - 2) * TILE
    player.vy = 0
  }
}

// ---------- 交互 ----------
function screenToTile() {
  const tx = Math.floor((mouse.x + renderer.camera.x) / TILE)
  const ty = Math.floor((mouse.y + renderer.camera.y) / TILE)
  return { tx, ty }
}

function withinReach(tx, ty) {
  const pcx = player.x + player.w / 2
  const pcy = player.y + player.h / 2
  const dx = (tx * TILE + TILE / 2 - pcx) / TILE
  const dy = (ty * TILE + TILE / 2 - pcy) / TILE
  return Math.hypot(dx, dy) <= REACH
}

let mineCooldown = 0
let placeCooldown = 0

function handleInteraction(dt) {
  mineCooldown = Math.max(0, mineCooldown - dt)
  placeCooldown = Math.max(0, placeCooldown - dt)

  const { tx, ty } = screenToTile()
  if (!withinReach(tx, ty)) return

  if (mouse.left && mineCooldown === 0) {
    const block = getBlock(tx, ty)
    if (block !== BLOCK.AIR) {
      const meta = BLOCK_META[block]
      if (meta) {
        setBlock(tx, ty, BLOCK.AIR)
        inventory[block] = (inventory[block] ?? 0) + 1
        // 上方悬空的水/火把掉落无效化，避免视觉残留
        mineCooldown = 90 + meta.hardness * 60
        renderHotbar()
        renderInventory()
      }
    }
  }

  if (mouse.right && placeCooldown === 0) {
    const block = HOTBAR[selectedIndex]
    const current = getBlock(tx, ty)
    const canPlace = current === BLOCK.AIR || current === BLOCK.WATER
    const overlapsPlayer = (() => {
      const px0 = Math.floor(player.x / TILE)
      const px1 = Math.floor((player.x + player.w - 1) / TILE)
      const py0 = Math.floor(player.y / TILE)
      const py1 = Math.floor((player.y + player.h - 1) / TILE)
      return tx >= px0 && tx <= px1 && ty >= py0 && ty <= py1
    })()
    if (canPlace && !(overlapsPlayer && BLOCK_META[block]?.solid) && (inventory[block] ?? 0) > 0) {
      setBlock(tx, ty, block)
      inventory[block] -= 1
      placeCooldown = 90
      renderHotbar()
      renderInventory()
    }
  }
}

// ---------- HUD ----------
let fpsAccum = 0
let fpsFrames = 0

function updateHud(dt) {
  const tx = Math.floor((player.x + player.w / 2) / TILE)
  const ty = Math.floor((player.y + player.h) / TILE)
  hudPos.textContent = `${tx}, ${ty}`

  const surfaceY = world.surface[Math.max(0, Math.min(world.width - 1, tx))] ?? 0
  const depth = ty - surfaceY
  hudDepth.textContent = depth <= 0 ? '地表' : `${depth} 格深`

  const dayProgress = (elapsedMs % DAY_LENGTH_MS) / DAY_LENGTH_MS
  const hours = (dayProgress * 24 + 6) % 24
  const hh = String(Math.floor(hours)).padStart(2, '0')
  const mm = String(Math.floor((hours % 1) * 60)).padStart(2, '0')
  hudTime.textContent = `${hh}:${mm}`

  fpsAccum += dt
  fpsFrames += 1
  if (fpsAccum >= 500) {
    hudFps.textContent = String(Math.round((fpsFrames * 1000) / fpsAccum))
    fpsAccum = 0
    fpsFrames = 0
  }
}

// ---------- 事件 ----------
window.addEventListener('keydown', (e) => {
  if (e.code === 'F5') {
    e.preventDefault()
    clearSave()
    location.reload()
    return
  }
  const num = Number(e.key)
  if (num >= 1 && num <= HOTBAR.length) {
    selectedIndex = num - 1
    renderHotbar()
    return
  }
  keys.add(e.code)
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
})

window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  mouse.x = e.clientX - rect.left
  mouse.y = e.clientY - rect.top
})
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouse.left = true
  if (e.button === 2) mouse.right = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false
  if (e.button === 2) mouse.right = false
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

let saveTimer = 0
setInterval(() => {
  saveTimer += 1
  if (saveTimer >= 5) {
    saveTimer = 0
    saveWorld(world, player, inventory, elapsedMs)
  }
}, 1000)
window.addEventListener('beforeunload', () => saveWorld(world, player, inventory, elapsedMs))

// ---------- 主循环 ----------
let last = performance.now()

function frame(now) {
  const dt = Math.min(64, now - last)
  last = now
  elapsedMs += dt

  updatePlayer(dt)
  handleInteraction(dt)
  renderer.follow(player)

  const { tx, ty } = screenToTile()
  renderer.draw({
    player,
    dayProgress: (elapsedMs % DAY_LENGTH_MS) / DAY_LENGTH_MS,
    selection: HOTBAR[selectedIndex],
    highlight: withinReach(tx, ty) ? { x: tx, y: ty } : null,
  })

  updateHud(dt)
  requestAnimationFrame(frame)
}

renderHotbar()
renderInventory()
requestAnimationFrame(frame)
