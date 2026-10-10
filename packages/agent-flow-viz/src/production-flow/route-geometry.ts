import { SQUARES } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type Route } from "./route-style"

export const NODE_WIDTH = 224
export const NODE_HEIGHT = 116
export const PLACES = SQUARES
export const arrowHead = (
  tip: { readonly x: number; readonly y: number },
  toward: { readonly x: number; readonly y: number }
) => {
  const length = Math.hypot(toward.x, toward.y)
  const ux = toward.x / length
  const uy = toward.y / length
  const bx = tip.x - ux * 12
  const by = tip.y - uy * 12
  return `M ${tip.x} ${tip.y} L ${bx - uy * 6} ${by + ux * 6} L ${bx + uy * 6} ${by - ux * 6} Z`
}
export const routeGeometry = (route: Route, offset: number) => {
  const from = PLACES[route.from]
  const to = PLACES[route.to]
  const fx = from.x + NODE_WIDTH / 2
  const fy = from.y + NODE_HEIGHT / 2
  if (route.from === "collection" && route.to === "collection") {
    const x = from.x + NODE_WIDTH / 2
    const y = from.y
    const high = 535
    const shift = 23
    return {
      path: `M ${x + shift - 42} ${y - 9} C ${x + shift - 65} ${high}, ${x + shift + 65} ${high}, ${x + shift + 42} ${y - 9}`,
      badge: { x: x + shift, y: high + 14 },
      tip: { x: x + shift + 42, y: y - 9 },
      toward: { x: -1, y: 1 }
    }
  }
  if (route.from === "delivery" && route.to === "delivery") {
    const x = from.x + NODE_WIDTH / 2
    const y = from.y + NODE_HEIGHT
    return {
      path: `M ${x - 40} ${y + 9} C ${x - 65} ${y + 70}, ${x + 65} ${y + 70}, ${x + 40} ${y + 9}`,
      badge: { x, y: y + 57 },
      tip: { x: x + 40, y: y + 9 },
      toward: { x: -1, y: -1 }
    }
  }
  if (route.from === "outcomes" && route.to === "outcomes") {
    const x = from.x + NODE_WIDTH / 2
    const y = from.y + NODE_HEIGHT
    return {
      path: `M ${x - 45} ${y + 9} C ${x - 58} ${y + 75}, ${x + 58} ${y + 75}, ${x + 45} ${y + 9}`,
      badge: { x, y: y + 59 },
      tip: { x: x + 45, y: y + 9 },
      toward: { x: -1, y: -1 }
    }
  }
  if (route.from === "round" && route.to === "round") {
    const x = from.x + NODE_WIDTH
    const y = from.y + NODE_HEIGHT / 2
    return {
      path: `M ${x + 9} ${y - 35} C ${x + 100} ${y - 70}, ${x + 100} ${y + 70}, ${x + 9} ${y + 35}`,
      badge: { x: x + 85, y },
      tip: { x: x + 9, y: y + 35 },
      toward: { x: -1, y: 0 }
    }
  }
  if (route.from === "scheduling" && route.to === "scheduling") {
    const x = from.x + NODE_WIDTH + 9
    const y = from.y + NODE_HEIGHT / 2
    return {
      path: `M ${x} ${y - 33} C ${x + 58} ${y - 65}, ${x + 58} ${y + 65}, ${x} ${y + 33}`,
      badge: { x: x + 31, y },
      tip: { x, y: y + 33 },
      toward: { x: -1, y: 0 }
    }
  }
  if (route.from === route.to) {
    const x = from.x + NODE_WIDTH - 18
    const y = from.y + NODE_HEIGHT
    return {
      path: `M ${x - 22} ${y} C ${x - 20} ${y + 100}, ${x + 44} ${y + 100}, ${x + 28} ${y - 2}`,
      badge: { x: x + 7, y: y + 71 },
      tip: { x: x + 28, y: y - 9 },
      toward: { x: 0, y: -1 }
    }
  }
  if (route.from === "admission" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH + 9
    const laneX = startX + 17
    const laneY = 177
    const endLaneX = to.x - 36
    const endX = to.x - 9
    const endY = to.y + NODE_HEIGHT / 2
    return {
      path: `M ${startX} ${from.y + NODE_HEIGHT / 2} L ${laneX} ${from.y + NODE_HEIGHT / 2} L ${laneX} ${laneY} L ${endLaneX} ${laneY} L ${endLaneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 750, y: laneY },
      tip: { x: endX, y: endY },
      toward: { x: 1, y: 0 }
    }
  }
  if (route.from === "sourcePending" && route.to === "preparation") {
    const startX = from.x + NODE_WIDTH / 2
    const laneX = to.x - 36
    const startY = from.y + NODE_HEIGHT + 9
    const laneY = 330
    const endX = to.x - 9
    const endY = to.y + NODE_HEIGHT / 2
    return {
      path: `M ${startX} ${startY} L ${startX} ${laneY} L ${laneX} ${laneY} L ${laneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 775, y: laneY },
      tip: { x: endX, y: endY },
      toward: { x: 1, y: 0 }
    }
  }
  if (route.from === "units" && route.to === "scheduling") {
    const startX = from.x + NODE_WIDTH / 2
    const y = 325
    const laneX = to.x + NODE_WIDTH + 36
    const endX = to.x + NODE_WIDTH + 9
    const endY = to.y + NODE_HEIGHT / 2
    return {
      path: `M ${startX} ${from.y + NODE_HEIGHT + 9} L ${startX} ${y} L ${laneX} ${y} L ${laneX} ${endY} L ${endX} ${endY}`,
      badge: { x: 1060, y },
      tip: { x: endX, y: endY },
      toward: { x: -1, y: 0 }
    }
  }
  if (route.from === "units" && route.to === "jev") {
    const startX = from.x + NODE_WIDTH / 2
    const endX = to.x + NODE_WIDTH / 2
    return {
      path: `M ${startX} ${from.y + NODE_HEIGHT + 9} L 1118 ${from.y + NODE_HEIGHT + 9} L 1118 334 L ${endX} 334 L ${endX} ${to.y - 9}`,
      badge: { x: 950, y: 334 },
      tip: { x: endX, y: to.y - 9 },
      toward: { x: 0, y: 1 }
    }
  }
  if (route.from === "collection" && route.to === "preparation") {
    const y = from.y + NODE_HEIGHT / 2
    const targetX = to.x + NODE_WIDTH / 2
    return {
      path: `M ${from.x - 9} ${y} L 12 ${y} L 12 22 L ${targetX} 22 L ${targetX} ${to.y - 9}`,
      badge: { x: 740, y: 22 },
      tip: { x: targetX, y: to.y - 9 },
      toward: { x: 0, y: 1 }
    }
  }
  if (route.from === "collection" && route.to === "round") {
    const startX = from.x + NODE_WIDTH / 2
    const endX = to.x + NODE_WIDTH / 2
    return {
      path: `M ${startX} ${from.y + NODE_HEIGHT} L ${startX} 742 L ${endX} 742 L ${endX} ${to.y + NODE_HEIGHT + 9}`,
      badge: { x: 560, y: 742 },
      tip: { x: endX, y: to.y + NODE_HEIGHT + 9 },
      toward: { x: 0, y: -1 }
    }
  }
  if (route.from === "authorization" && route.to === "outcomes") {
    const lane = 515 + offset
    return {
      path: `M ${from.x} ${fy + offset} C 970 ${lane}, 680 ${lane}, ${to.x + NODE_WIDTH + 9} ${to.y + NODE_HEIGHT - 12 + offset}`,
      badge: { x: 775, y: lane },
      tip: { x: to.x + NODE_WIDTH + 9, y: to.y + NODE_HEIGHT - 12 + offset },
      toward: { x: -1, y: -1 }
    }
  }
  if (route.from === "effect" && route.to === "outcomes") {
    const lane = 475 + offset
    return {
      path: `M ${from.x} ${fy + offset} C 760 ${lane}, 645 ${lane}, ${to.x + NODE_WIDTH + 9} ${to.y + NODE_HEIGHT - 18 + offset}`,
      badge: { x: 655, y: lane },
      tip: { x: to.x + NODE_WIDTH + 9, y: to.y + NODE_HEIGHT - 18 + offset },
      toward: { x: -1, y: -1 }
    }
  }
  const tx = to.x + NODE_WIDTH / 2
  const ty = to.y + NODE_HEIGHT / 2
  const dx = tx - fx
  const dy = ty - fy
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const start = horizontal
    ? { x: fx + Math.sign(dx) * (NODE_WIDTH / 2 + 9), y: fy + offset }
    : { x: fx + offset, y: fy + Math.sign(dy) * (NODE_HEIGHT / 2 + 9) }
  const end = horizontal
    ? { x: tx - Math.sign(dx) * (NODE_WIDTH / 2 + 9), y: ty + offset }
    : { x: tx + offset, y: ty - Math.sign(dy) * (NODE_HEIGHT / 2 + 9) }
  const bend = Math.abs(offset) > 0 ? offset * 1.8 : 0
  const path = horizontal
    ? `M ${start.x} ${start.y} C ${(start.x + end.x) / 2} ${start.y + bend}, ${(start.x + end.x) / 2} ${end.y + bend}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${start.x + bend} ${(start.y + end.y) / 2}, ${end.x + bend} ${(start.y + end.y) / 2}, ${end.x} ${end.y}`
  return {
    path,
    badge: { x: (start.x + end.x) / 2 + (horizontal ? 0 : bend), y: (start.y + end.y) / 2 + (horizontal ? bend : 0) },
    tip: end,
    toward: horizontal ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }
  }
}
