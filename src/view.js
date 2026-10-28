// A 180-degree rotation is its own inverse. Walls use an 8×8 anchor grid.
export function viewFlipped(side,startPosition='top') {
  return (side===0)===(startPosition==='top');
}
export function orientPosition(position, flipped) {
  return flipped ? {...position, x:8-position.x, y:8-position.y} : {...position};
}
export function orientAction(action, flipped) {
  if (!flipped) return {...action};
  const edge = action.type === 'wall' ? 7 : 8;
  return {...action, x:edge-action.x, y:edge-action.y};
}
