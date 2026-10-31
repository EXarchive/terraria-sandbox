// 方块地心 —— 泰拉瑞亚风格 2D 沙盒
// 纯前端实现：程序化地形生成 + 瓦片物理 + 挖掘/放置 + 昼夜循环 + 本地存档。
// 不依赖任何第三方库，所有渲染由 Canvas 2D 完成。

export const TILE = 16

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAF: 5,
  COAL: 6,
  IRON: 7,
  GOLD: 8,
  SAND: 9,
  WATER: 10,
  PLANK: 11,
  TORCH: 12,
}

export const BLOCK_META = {
  [BLOCK.GRASS]: { name: '草方块', color: '#4caf50', solid: true, hardness: 0.35 },
  [BLOCK.DIRT]: { name: '泥土', color: '#8d5a3b', solid: true, hardness: 0.3 },
  [BLOCK.STONE]: { name: '石头', color: '#7b8290', solid: true, hardness: 0.9 },
  [BLOCK.WOOD]: { name: '原木', color: '#6b4a2b', solid: true, hardness: 0.6 },
  [BLOCK.LEAF]: { name: '树叶', color: '#2f8f46', solid: true, hardness: 0.15 },
  [BLOCK.COAL]: { name: '煤矿', color: '#3a3f45', solid: true, hardness: 1.1 },
  [BLOCK.IRON]: { name: '铁矿', color: '#b0a08c', solid: true, hardness: 1.4 },
  [BLOCK.GOLD]: { name: '金矿', color: '#e0b83a', solid: true, hardness: 1.8 },
  [BLOCK.SAND]: { name: '沙子', color: '#ddca8a', solid: true, hardness: 0.25 },
  [BLOCK.WATER]: { name: '水', color: '#3b7dd8', solid: false, hardness: 0 },
  [BLOCK.PLANK]: { name: '木板', color: '#a97742', solid: true, hardness: 0.4 },
  [BLOCK.TORCH]: { name: '火把', color: '#ffb347', solid: false, hardness: 0.05 },
}

// 可放入快捷栏的方块（按 1-9 顺序）
export const HOTBAR = [
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.PLANK,
  BLOCK.WOOD,
  BLOCK.SAND,
  BLOCK.TORCH,
  BLOCK.LEAF,
  BLOCK.GRASS,
  BLOCK.COAL,
]
