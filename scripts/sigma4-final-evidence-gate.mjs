import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {checkSigma4Promotion} from './sigma4-promotion-evidence.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const holdout=read('evaluation/sigma4-holdout-verdict.json');
const guarded=read('evaluation/sigma4-guarded-pilot-assessment.json');
const candidate=holdout.pooled;
const quality=checkSigma4Promotion({games:candidate.games,wins:candidate.wins,
 uniqueGames:candidate.uniqueSequences,uniqueFirstSix:candidate.uniqueFirstSix,
 seedPairs:12,pairedRoles:true,cutoffs:candidate.cutoffs,modelsFrozen:true});
const guard=guarded.guardedPilot;
const guardedQuality=checkSigma4Promotion({games:guard.games,wins:guard.wins,uniqueGames:guard.unique,uniqueFirstSix:guard.firstSix,seedPairs:2,pairedRoles:true,cutoffs:0,modelsFrozen:true});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const report={version:'sigma4-independent-holdout-plus-guarded-prototype-v1',
 originalSigma4Research:{...candidate,evidence:quality},
 guardedSigma4Prototype:{...guard,evidence:guardedQuality},
 observedRootRisk:read('evaluation/sigma4-choice-risk-audit.json').summary.map(s=>({name:s.name,group:s.group})),
 sourceSHA256:{candidateSelector:hash('scripts/sigma4-weighted-research-choice.mjs'),
 guardedSelector:hash('scripts/sigma4-guarded-research-choice.mjs'),
 engineWorker:hash('scripts/sigma-inference-worker.py'),
 holdout:hash('evaluation/sigma4-vs-sigma3-holdout.json'),
 guardedPilot:hash('evaluation/sigma4-guarded-vs-sigma3-pilot.json')},
 productionChanged:false,modelTrainingApproved:false,enginePromotionApproved:false,
 conclusions:['Weighted Q/visit candidate 15/24 pooled, but independent holdout 7/12: positive trend, insufficient significance',
 'Guarded sampler yielded 3/4 in pilot but only 2 distinct full games and 1 deviation from native; not evidence of superior play',
 'Do not select or tune parameters using the same data and claim independent verification',
 'Next iteration must create genuinely varied complete openings with predeclared evaluation seeds and more paired comparisons']};
writeFileSync('evaluation/sigma4-final-evidence-gate.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({original:quality,guarded:guardedQuality,productionChanged:report.productionChanged},null,2));
