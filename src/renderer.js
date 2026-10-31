// 渲染层：只负责把世界/玩家/光照画出来
import { BLOCK, BLOCK_META, TILE } from './blocks.js'

const SKY_DAY = ['#7ec8ff', '#bfe6ff']
const SKY_NIGHT = ['#0b1020', '#1b2340']
const CAVE_BG = '#171b26'

function lerp(a, b, t) {
  return a + (b - a) * t
}

function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(lerp(ca.r, cb.r, t))
  const g = Math.round(lerp(ca.g, cb.g, t))
  const bl = Math.round(lerp(ca.b, cb.b, t))
  return `rgb(${r}, ${g}, ${bl})`
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.world = world
    this.camera = { x: 0, y: 0 }
    this.viewW = 0
    this.viewH = 0
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.viewW = this.canvas.clientWidth
    this.viewH = this.canvas.clientHeight
    this.canvas.width = Math.floor(this.viewW * dpr)
    this.canvas.height = Math.floor(this.viewH * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
  }

  follow(player) {
    const worldPixelW = this.world.width * TILE
    const worldPixelH = this.world.height * TILE
    const targetX = player.x + player.w / 2 - this.viewW / 2
    const targetY = player.y + player.h / 2 - this.viewH / 2
    const maxX = Math.max(0, worldPixelW - this.viewW)
    const maxY = Math.max(0, worldPixelH - this.viewH)
    // 平滑跟随
    this.camera.x = Math.max(0, Math.min(maxX, lerp(this.camera.x, targetX, 0.18)))
    this.camera.y = Math.max(0, Math.min(maxY, lerp(this.camera.y, targetY, 0.18)))
  }

  // dayProgress: 0=午夜 0.25=日出 0.5=正午 0.75=日落
  draw(state) {
    const { player, dayProgress, selection, highlight } = state
    const ctx = this.ctx
    const cam = this.camera

    this.drawSky(dayProgress)

    const x0 = Math.max(0, Math.floor(cam.x / TILE))
    const y0 = Math.max(0, Math.floor(cam.y / TILE))
    const x1 = Math.min(this.world.width, Math.ceil((cam.x + this.viewW) / TILE) + 1)
    const y1 = Math.min(this.world.height, Math.ceil((cam.y + this.viewH) / TILE) + 1)

    // 地形
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const block = this.world.data[y * this.world.width + x]
        const px = Math.round(x * TILE - cam.x)
        const py = Math.round(y * TILE - cam.y)
        if (block === BLOCK.AIR) {
          // 地表以下的空腔画成洞穴底色，避免透出天空
          const surfaceY = this.world.surface[x]
          if (surfaceY !== undefined && y > surfaceY) {
            ctx.fillStyle = CAVE_BG
            ctx.fillRect(px, py, TILE, TILE)
          }
          continue
        }
        this.drawBlock(block, px, py, x, y)
      }
    }

    // 玩家
    this.drawPlayer(player)

    // 光照/夜色叠加
    const night = this.nightAmount(dayProgress)
    if (night > 0.01) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = `rgba(10, 16, 40, ${night * 0.86})`
      ctx.fillRect(0, 0, this.viewW, this.viewH)
      ctx.restore()
    }

    // 选中框
    if (highlight) {
      const px = Math.round(highlight.x * TILE - cam.x)
      const py = Math.round(highlight.y * TILE - cam.y)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2)
      if (selection) {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = BLOCK_META[selection]?.color ?? '#ffffff'
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4)
      }
      ctx.restore()
    }
  }

  drawSky(dayProgress) {
    const night = this.nightAmount(dayProgress)
    const ctx = this.ctx
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH)
    grad.addColorStop(0, mixHex(SKY_DAY[0], SKY_NIGHT[0], night))
    grad.addColorStop(1, mixHex(SKY_DAY[1], SKY_NIGHT[1], night))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, this.viewW, this.viewH)
  }

  nightAmount(dayProgress) {
    // 06:00 日出 → 18:00 日落，其余时间为夜晚
    const hours = ((dayProgress * 24) + 6) % 24
    if (hours >= 6 && hours < 18) {
      const daylight = Math.sin(((hours - 6) / 12) * Math.PI) // 0 → 1 → 0
      return Math.max(0, 1 - (0.42 + daylight * 0.58))
    }
    return 1
  }

  drawBlock(block, px, py, x, y) {
    const ctx = this.ctx
    const meta = BLOCK_META[block]
    if (!meta) return

    if (block === BLOCK.WATER) {
      ctx.fillStyle = meta.color
      ctx.globalAlpha = 0.65
      ctx.fillRect(px, py, TILE, TILE)
      ctx.globalAlpha = 1
      return
    }

    if (block === BLOCK.TORCH) {
      ctx.fillStyle = '#5a3a1e'
      ctx.fillRect(px + TILE / 2 - 1.5, py + 4, 3, TILE - 4)
      const g = ctx.createRadialGradient(px + TILE / 2, py + 5, 1, px + TILE / 2, py + 5, 14)
      g.addColorStop(0, 'rgba(255, 196, 92, 0.95)')
      g.addColorStop(1, 'rgba(255, 150, 40, 0)')
      ctx.fillStyle = g
      ctx.fillRect(px - 10, py - 10, TILE + 20, TILE + 20)
      return
    }

    // 基础色块 + 上缘高光 + 下缘阴影，做出像素立体感
    ctx.fillStyle = meta.color
    ctx.fillRect(px, py, TILE, TILE)

    const shade = this.hash(x, y)
    ctx.fillStyle = `rgba(255,255,255,${0.05 + shade * 0.07})`
    ctx.fillRect(px, py, TILE, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(px, py + TILE - 3, TILE, 3)

    // 矿石点缀
    if (block === BLOCK.COAL || block === BLOCK.IRON || block === BLOCK.GOLD) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      for (let i = 0; i < 3; i++) {
        const ox = 2 + ((this.hash(x + i, y) * 10) | 0)
        const oy = 2 + ((this.hash(x, y + i) * 10) | 0)
        ctx.fillRect(px + ox, py + oy, 3, 3)
      }
    }

    // 草方块顶部草皮
    if (block === BLOCK.GRASS) {
      ctx.fillStyle = '#69d06a'
      ctx.fillRect(px, py, TILE, 4)
    }
  }

  hash(x, y) {
    let h = x * 374761393 + y * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) >>> 0) / 4294967296
  }

  drawPlayer(player) {
    const ctx = this.ctx
    const px = Math.round(player.x - this.camera.x)
    const py = Math.round(player.y - this.camera.y)

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(px + player.w / 2, py + player.h + 2, player.w * 0.45, 3, 0, 0, Math.PI * 2)
    ctx.fill()

    // 身体
    ctx.fillStyle = '#3f6dd8'
    ctx.fillRect(px + 2, py + 10, player.w - 4, player.h - 12)
    // 头
    ctx.fillStyle = '#f2c9a0'
    ctx.fillRect(px + 3, py, player.w - 6, 10)
    // 头发
    ctx.fillStyle = '#3a2a1c'
    ctx.fillRect(px + 3, py, player.w - 6, 3)
    // 眼睛（朝向）
    ctx.fillStyle = '#1b1b1b'
    const eyeX = player.facing >= 0 ? px + player.w - 7 : px + 4
    ctx.fillRect(eyeX, py + 4, 2, 2)
    // 腿
    ctx.fillStyle = '#2a4a9c'
    ctx.fillRect(px + 3, py + player.h - 4, 4, 4)
    ctx.fillRect(px + player.w - 7, py + player.h - 4, 4, 4)
  }
}
