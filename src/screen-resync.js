import {snapshotFromDraft,checkedSnapshot} from './observed-state.js';
// Automatic resync must use fresh visual evidence, never old manual selections.
export function automaticResyncSnapshot({draft,source,automaticGrid,autoSide,autoTurn}){
 if(!automaticGrid||!draft)throw Error('보드를 자동 확정하지 못했습니다. 영역을 확인해 주세요.');
 if(!autoSide||!autoTurn)throw Error('진영·차례의 자동 판독이 꺼져 있습니다. 현재 값을 확인해 적용해 주세요.');
 if(source?.bottom!==0&&source?.bottom!==1)throw Error('아래 출발 줄 색을 확정하지 못했습니다.');
 if(draft.notes?.length||draft.wallIssues?.length)throw Error([...draft.notes??[],...draft.wallIssues??[]].join(' '));
 const base=snapshotFromDraft(draft,{bottom:source.bottom,turn:0});
 if(source.relative!=='self'&&source.relative!=='opponent'&&base.winner===null)throw Error(source.turnReason??'현재 차례를 확정하지 못했습니다.');
 return checkedSnapshot(snapshotFromDraft(draft,{bottom:source.bottom,turn:source.relative==='self'?source.bottom:1-source.bottom}));
}
