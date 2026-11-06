// Missing engine statistics must never become fabricated zeroes or a depth.
export function analysisDepth(result){
 if(result.winProof?.shortestWinProven===false)return '승리 전략 확인';
 if(result.exact===true)return '종반 계산 완료';
 return Number.isFinite(result.depth)&&result.depth>0?`깊이 ${result.depth}`:'';
}
export function analysisMetadata(result){
 const parts=[result.done?'분석 완료':'분석 중'];
 if(Number.isFinite(result.elapsedMs)&&result.elapsedMs>=0)parts.push(`${(result.elapsedMs/1000).toFixed(2)}초`);
 if(Number.isInteger(result.simulations)&&result.simulations>0)parts.push(`${result.simulations}회 탐색`);
 else if(Number.isFinite(result.nodes)&&result.nodes>0)parts.push(`${result.nodes.toLocaleString()}개 노드`);
 return parts.join(' · ');
}
export function analysisError(error){
 const message=String(error?.message??error??'');
 if(/build|빌드|버전.*불일치/i.test(message))return '앱과 엔진 버전이 다릅니다. 쿼리도 실행기를 다시 연 뒤 분석하세요.';
 if(/unavailable|fetch|network|connect|연결|사용할 수 없/i.test(message))return '분석 엔진에 연결하지 못했습니다. 쿼리도 앱을 실행한 뒤 다시 분석하세요.';
 if(/timeout|watchdog|시간|2초/i.test(message))return '정해진 시간 안에 분석을 완료하지 못했습니다. 배치를 확인하고 다시 분석하세요.';
 if(/[가-힣]/.test(message)&&message.length<140&&!message.includes('\n'))return message;
 return '분석을 완료하지 못했습니다. 배치를 확인하고 다시 분석하세요.';
}
