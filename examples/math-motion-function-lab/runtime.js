var MathMotionFunctionLab=(function(Ee){Object.defineProperty(Ee,Symbol.toStringTag,{value:"Module"});var _e={rectangleWidth:8,rectangleHeight:6,pSpeed:2,qSpeed:1.5,tMin:0,tMax:4},ut={base:{linear:6,quadratic:1.5,domain:[0,4]},domainVariant:{linear:6,quadratic:.5,domain:[0,4]},transfer:{linear:6,quadratic:.75,domain:[0,8]}};function Re(e,n,a){return Math.min(a,Math.max(n,e))}function ne(e,n){if(!Number.isFinite(e)||e<=0)throw new Error(`${n} must be a finite positive number`)}function Be(e){if(ne(e.rectangleWidth,"rectangleWidth"),ne(e.rectangleHeight,"rectangleHeight"),ne(e.pSpeed,"pSpeed"),ne(e.qSpeed,"qSpeed"),!Number.isFinite(e.tMin)||!Number.isFinite(e.tMax)||e.tMin!==0)throw new Error("linked-graph currently requires a finite domain beginning at t = 0");if(e.tMax<=e.tMin)throw new Error("tMax must be greater than tMin");const n=e.pSpeed*e.tMax,a=e.rectangleHeight-e.qSpeed*e.tMax;if(n>e.rectangleWidth+1e-9||a<-1e-9)throw new Error("the declared time domain moves P or Q outside the rectangle")}function U(e){return Be(e),{linear:.5*e.pSpeed*e.rectangleHeight,quadratic:.5*e.pSpeed*e.qSpeed,domain:[e.tMin,e.tMax]}}function ie(e,n){return e.linear*n-e.quadratic*n*n}function j(e){ne(e.quadratic,"quadratic");const[n,a]=e.domain;if(!Number.isFinite(n)||!Number.isFinite(a)||a<n)throw new Error("quadratic domain is invalid");return[n,a,Re(e.linear/(2*e.quadratic),n,a)].map(r=>({input:r,value:ie(e,r)})).reduce((r,i)=>i.value>r.value?i:r)}function Ve(e,n){Be(e);const a=Re(n,e.tMin,e.tMax),r=e.pSpeed*a,i=e.rectangleHeight-e.qSpeed*a;return{t:a,ap:r,bq:i,p:{x:r,y:0},q:{x:e.rectangleWidth,y:i},area:.5*r*i}}function gt(e,n=80){const a=Math.max(2,Math.floor(n)),[r,i]=e.domain;return Array.from({length:a+1},(V,Y)=>{const I=r+(i-r)*(Y/a);return{input:I,value:ie(e,I)}})}var je="mathMotion.completedBeats",ft="mathMotion.prediction",ge="mathMotion.hintCount";function Ie(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function bt(e){return Ie(e)&&typeof e.linear=="number"&&typeof e.quadratic=="number"&&Array.isArray(e.domain)&&e.domain.length===2&&e.domain.every(n=>typeof n=="number")}function Oe(e,n){return Ie(e)&&bt(e[n])?e[n]:ut[n]}function fe(e){const n=Math.abs(e)<1e-9?0:Math.round(e*100)/100;return Number.isInteger(n)?String(n):String(n).replace(/0+$/,"")}function Le(e,n){return Object.entries(n).reduce((a,[r,i])=>a.replaceAll(`{${r}}`,String(i)),e)}function s(e,n=""){const a=document.createElement(e);return n&&(a.className=n),a}function D(e,n={}){const a=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.entries(n).forEach(([r,i])=>a.setAttribute(r,String(i))),a}function be(e,n){return e==="prediction"?n==="prediction_locked":n.endsWith("_complete")}function ht(e){return e==="prediction"?"prediction.locked":`${e}.completed`}function Tt(e){return e}function xt(e,n){const a=e.courseState?.get(je),r=Array.isArray(a)?a.filter(i=>typeof i=="string"):[];r.includes(n)||e.courseState?.set(je,[...r,n])}function yt(e){const n=s("style");return n.textContent=`
    .${e} {
      --paper: #FBF8F1;
      --ink: #16191F;
      --muted: #74777C;
      --line: #C9CDD2;
      --blue: #145DCE;
      --blue-soft: #DCE9FF;
      --red: #E04424;
      --red-soft: #F8D9CF;
      --focus: #0A53BE;
      width: 100%;
      height: 100%;
      color: var(--ink);
      background: transparent;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      container-type: size;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .${e} * { box-sizing: border-box; }
    .${e} button,
    .${e} select {
      font: inherit;
    }
    .${e} button:focus-visible,
    .${e} select:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--focus) 55%, transparent);
      outline-offset: 3px;
    }
    .${e} .lab-sheet {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .${e} .eyebrow {
      margin: 0;
      color: var(--blue);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
    }
    .${e} .instruction {
      margin: 0;
      color: var(--ink);
      font-size: clamp(17px, 2.1cqh, 21px);
      font-weight: 700;
      line-height: 1.55;
    }
    .${e} .muted {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
    }
    .${e} .math {
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
    }
    .${e} .choice,
    .${e} .action,
    .${e} .step-chip {
      min-height: 48px;
      border: 1px solid var(--line);
      border-radius: 4px;
      color: var(--ink);
      background: color-mix(in srgb, var(--paper) 82%, white);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .${e} .choice:hover:not(:disabled),
    .${e} .step-chip:hover:not(:disabled) {
      border-color: var(--blue);
      transform: translateY(-1px);
    }
    .${e} .choice[data-selected="true"],
    .${e} .step-chip[data-selected="true"] {
      border-color: var(--blue);
      color: var(--blue);
      background: var(--blue-soft);
      font-weight: 800;
    }
    .${e} .choice[data-wrong="true"],
    .${e} select[data-wrong="true"] {
      border-color: var(--red);
      background: var(--red-soft);
    }
    .${e} .action {
      border-color: var(--blue);
      color: white;
      background: var(--blue);
      font-weight: 800;
      letter-spacing: .02em;
    }
    .${e} .action.secondary {
      color: var(--blue);
      background: transparent;
    }
    .${e} button:disabled,
    .${e} select:disabled {
      cursor: default;
      opacity: .62;
      transform: none;
    }
    .${e} .status-line {
      min-height: 46px;
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .${e} .status-line[data-tone="red"] { color: var(--red); }
    .${e} .status-line[data-tone="blue"] { color: var(--blue); font-weight: 700; }

    .${e} .prediction-layout {
      display: grid;
      grid-template-columns: .9fr 1.1fr;
      gap: 54px;
      height: 100%;
      padding: 10px 12px 4px;
      align-items: center;
    }
    .${e} .prediction-stem {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-left: 8px;
      border-left: 7px solid var(--blue);
    }
    .${e} .prediction-mark {
      margin: 10px 0 18px;
      color: var(--red);
      font: 700 clamp(54px, 10cqh, 92px)/1 "Cambria Math", Cambria, serif;
    }
    .${e} .prediction-strip {
      position: relative;
      min-height: 300px;
      padding: 24px 26px;
      border-top: 1px solid var(--ink);
      border-bottom: 1px solid var(--line);
    }
    .${e} .motion-track {
      position: relative;
      height: 118px;
      margin: 30px 16px 28px;
    }
    .${e} .motion-track::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 55px;
      height: 2px;
      background: var(--ink);
    }
    .${e} .motion-track span {
      position: absolute;
      top: 44px;
      width: 23px;
      height: 23px;
      border: 4px solid var(--paper);
      border-radius: 50%;
      background: var(--blue);
      box-shadow: 0 0 0 1px var(--blue);
    }
    .${e} .motion-track span:nth-child(1) { left: 0; }
    .${e} .motion-track span:nth-child(2) { left: calc(50% - 12px); }
    .${e} .motion-track span:nth-child(3) { right: 0; }
    .${e} .prediction-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .${e} .prediction-options .choice { padding: 12px 8px; }

    .${e} .constraints-layout {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 44px;
      height: 100%;
      padding: 6px 8px;
    }
    .${e} .source-notes {
      position: relative;
      padding: 24px 24px 18px;
      border-left: 1px solid var(--ink);
      border-top: 8px solid var(--red);
    }
    .${e} .source-notes dl { margin: 22px 0 0; }
    .${e} .source-notes dt {
      margin-top: 18px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: .08em;
    }
    .${e} .source-notes dd {
      margin: 4px 0 0;
      color: var(--ink);
      font: 700 26px/1.35 "Cambria Math", Cambria, serif;
    }
    .${e} .classification-grid {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 16px;
      min-width: 0;
    }
    .${e} .classification-rows {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 18px;
      align-content: center;
    }
    .${e} .classification-row,
    .${e} .assembly-row {
      display: grid;
      grid-template-columns: minmax(120px, .72fr) minmax(180px, 1.28fr);
      gap: 12px;
      align-items: center;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }
    .${e} .classification-row strong,
    .${e} .assembly-row strong { font-size: 17px; }
    .${e} select {
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 0 12px;
      color: var(--ink);
      background: white;
    }
    .${e} .row-actions {
      display: grid;
      grid-template-columns: minmax(180px, 260px) 1fr;
      gap: 18px;
      align-items: center;
    }

    .${e} .model-layout {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 34px;
      height: 100%;
      padding: 2px 6px;
    }
    .${e} .assembly-board {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding-right: 28px;
      border-right: 1px solid var(--line);
    }
    .${e} .assembly-rows { align-self: center; }
    .${e} .model-preview {
      position: relative;
      align-self: center;
      min-height: 330px;
      padding: 24px 28px;
      border-top: 1px solid var(--ink);
      background: linear-gradient(160deg, transparent 0 70%, var(--blue-soft) 70% 100%);
    }
    .${e} .model-preview .large-formula {
      margin: 42px 0 18px;
      color: var(--ink);
      font: 700 clamp(30px, 5cqh, 46px)/1.3 "Cambria Math", Cambria, serif;
    }
    .${e} .model-preview .large-formula em { color: var(--red); font-style: normal; }
    .${e} .model-preview .domain-seal {
      display: inline-block;
      padding: 8px 14px;
      color: var(--blue);
      border: 1px solid var(--blue);
      border-radius: 999px;
      font-weight: 700;
    }

    .${e} .domain-layout {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 36px;
      height: 100%;
      padding: 0 8px;
    }
    .${e} .domain-graph-panel {
      display: grid;
      grid-template-rows: auto 1fr;
      border-bottom: 1px solid var(--ink);
    }
    .${e} .domain-graph { width: 100%; height: 100%; overflow: visible; }
    .${e} .domain-task {
      align-self: center;
      padding: 22px 0 12px;
    }
    .${e} .domain-options {
      display: grid;
      gap: 11px;
      margin: 20px 0;
    }
    .${e} .domain-options .choice {
      padding: 12px 16px;
      text-align: left;
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: 18px;
    }
    .${e} .domain-conclusion {
      color: var(--red);
      font: 700 28px/1.4 "Cambria Math", Cambria, serif;
    }

    .${e} .transfer-layout {
      display: grid;
      grid-template-columns: .92fr 1.08fr;
      gap: 42px;
      height: 100%;
      padding: 0 4px;
    }
    .${e} .transfer-geometry {
      position: relative;
      padding: 22px;
      border: 1px solid var(--line);
      background: linear-gradient(135deg, color-mix(in srgb, var(--blue-soft) 34%, transparent), transparent 62%);
    }
    .${e} .transfer-geometry svg { width: 100%; height: 300px; }
    .${e} .transfer-task {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 16px;
      min-width: 0;
    }
    .${e} .transfer-selects {
      display: grid;
      gap: 18px;
      align-content: center;
    }
    .${e} .transfer-selects label {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 14px;
      align-items: center;
      font-weight: 700;
    }
    .${e} .hint-strip {
      padding: 12px 16px;
      border-left: 5px solid var(--blue);
      color: var(--blue);
      background: var(--blue-soft);
      font-size: 14px;
      line-height: 1.6;
    }
    .${e} .transfer-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .${e} .summary-layout {
      display: grid;
      grid-template-rows: 92px 1fr 112px;
      gap: 18px;
      height: 100%;
      padding: 2px 8px;
    }
    .${e} .evidence-ribbon {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      color: white;
      background: var(--ink);
    }
    .${e} .evidence-ribbon article {
      padding: 14px 18px;
      background: var(--ink);
    }
    .${e} .evidence-ribbon span {
      display: block;
      color: color-mix(in srgb, white 65%, var(--blue-soft));
      font-size: 11px;
      letter-spacing: .08em;
    }
    .${e} .evidence-ribbon strong {
      display: block;
      margin-top: 5px;
      color: white;
      font: 700 20px/1.25 "Cambria Math", Cambria, serif;
    }
    .${e} .method-workbench {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 14px;
    }
    .${e} .method-slots,
    .${e} .method-bank {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .${e} .method-slot {
      min-height: 86px;
      display: grid;
      place-items: center;
      padding: 10px 8px;
      border-top: 4px solid var(--line);
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      text-align: center;
      font-size: 15px;
    }
    .${e} .method-slot[data-filled="true"] {
      border-top-color: var(--blue);
      color: var(--ink);
      font-weight: 800;
    }
    .${e} .method-slot b {
      display: block;
      margin-bottom: 4px;
      color: var(--red);
      font: 700 19px/1 "Cambria Math", Cambria, serif;
    }
    .${e} .method-bank .step-chip { padding: 10px; }
    .${e} .summary-actions {
      display: grid;
      grid-template-columns: 140px 140px 230px 1fr;
      gap: 10px;
      align-items: center;
    }
    .${e} .completion-band {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 18px;
      align-items: center;
      padding: 12px 20px;
      color: var(--blue);
      border-top: 1px solid var(--blue);
      border-bottom: 1px solid var(--blue);
      font-weight: 800;
    }
    .${e} .completion-band strong {
      color: var(--red);
      font: 700 30px/1 "Cambria Math", Cambria, serif;
    }
    .${e} .lab-sheet.has-next .status-line { padding-right: 258px; }
    .${e} .component-next {
      position: absolute;
      z-index: 8;
      right: 4px;
      bottom: 4px;
      width: 238px;
      min-height: 46px;
      box-shadow: 0 0 0 8px var(--paper);
    }
    .${e}[data-reduced-motion="true"] * { transition: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .${e} * { transition: none !important; }
    }
  `,n}function vt(e){return["prediction","constraints","model","domain","transfer","summary"].includes(e)}function wt(e){const n=e.dom.root,a=`motion-structured-${e.instanceId.replace(/[^a-z0-9_-]/gi,"-")}`;let r=e.props,i=e.mode,V=e.width,Y=e.height,I=!0,N=!1,A=!1;const t={prediction:"",constraints:{},model:{},domain:"",transfer:{},summary:[],attempts:0,incorrect:[],feedbackKey:"",completed:!1,hintShown:!1};n.classList.add(a);const P=l=>r.content[l]??"",u=(l,c,p="")=>{const h=s(l,p);return h.textContent=P(c),h.dataset.coursewareEditKey=`content.${c}`,h},H=()=>i==="preview"&&!N&&!t.completed&&!be(r.mode,r.phase);function R(){n.style.setProperty("--paper",r.palette.paper),n.style.setProperty("--ink",r.palette.ink),n.style.setProperty("--muted",r.palette.muted),n.style.setProperty("--line",r.palette.line),n.style.setProperty("--blue",r.palette.blue),n.style.setProperty("--blue-soft",r.palette.blueSoft),n.style.setProperty("--red",r.palette.red),n.style.setProperty("--red-soft",r.palette.redSoft),n.style.setProperty("--focus",r.palette.focus),n.dataset.reducedMotion=String(r.reducedMotion)}function G(){n.style.width=`${Math.max(1,V)}px`,n.style.height=`${Math.max(1,Y)}px`}function X(){r.phase==="prediction_locked"&&(t.prediction||="middle"),r.phase==="constraints_complete"&&(t.constraints={speed:"constant",time:"variable",domain:"range",area:"target"}),r.phase==="model_complete"&&(t.model={ap:"apCorrect",bq:"bqCorrect",domain:"domainCorrect",area:"areaCorrect"}),r.phase==="domain_complete"&&(t.domain="endpoint"),r.phase==="transfer_hint"&&(t.hintShown=!0),r.phase==="transfer_complete"&&(t.transfer={formula:"formulaCorrect",result:"resultCorrect"},t.hintShown=!0),r.phase==="summary_complete"&&(t.summary=["constraints","variables","relation","domain","interpret"]),t.completed=t.completed||be(r.mode,r.phase)}function O(l){return N?{text:P("suspendedHint"),tone:""}:i!=="preview"?{text:P("disabledHint"),tone:""}:t.completed||be(r.mode,r.phase)?{text:P("completeStatus"),tone:"blue"}:t.feedbackKey?{text:P(t.feedbackKey),tone:"red"}:{text:P(l),tone:""}}function Z(l){const c=s("p","status-line"),p=O(l);return c.textContent=p.text,c.dataset.tone=p.tone,c.setAttribute("aria-live","polite"),c}function _(l,c,p,h){const g=u("button",l,c);return g.type="button",g.dataset.focusKey=p,g.disabled=!H(),g.addEventListener("click",m=>{m.stopPropagation(),h()}),g}function W(l){t.completed=!0,t.feedbackKey="",xt(e,r.mode),e.emit(ht(r.mode),l)}function ae(l){const c=s("section","prediction-layout"),p=s("div","prediction-stem");p.append(u("p","kicker","eyebrow"),u("div","predictionMark","prediction-mark math"),u("p","instruction","instruction"),u("p","predictionContext","muted"));const h=s("div","prediction-strip");h.append(u("p","choiceHeading","eyebrow"));const g=s("div","motion-track");g.setAttribute("aria-hidden","true"),g.append(s("span"),s("span"),s("span")),h.append(g);const m=s("div","prediction-options");[["start","optionStart"],["middle","optionMiddle"],["end","optionEnd"]].forEach(([y,f])=>{const M=_(f,"choice",`prediction-${y}`,()=>{t.prediction=y,t.feedbackKey="",$(`prediction-${y}`)});M.dataset.selected=String(t.prediction===y),M.setAttribute("aria-pressed",String(t.prediction===y)),m.append(M)});const x=_("lockLabel","action","prediction-lock",()=>{if(!t.prediction){t.feedbackKey="selectionRequired",$("prediction-lock");return}e.courseState?.set(ft,t.prediction),W({selection:t.prediction}),$()});x.disabled=!H()||!t.prediction,h.append(m,x,Z("initialStatus")),c.append(p,h),l.append(c)}function J(l,c,p,h,g){const m=s("select");m.dataset.focusKey=l,m.dataset.wrong=String(g),m.disabled=!H();const x=s("option");return x.value="",x.textContent=P("choosePlaceholder"),m.append(x),p.forEach(([y,f])=>{const M=s("option");M.value=y,M.textContent=P(f),m.append(M)}),m.value=c,m.addEventListener("change",y=>{y.stopPropagation(),h(m.value)}),m}function pe(l){const c=s("section","constraints-layout"),p=s("aside","source-notes");p.append(u("p","kicker","eyebrow"),u("p","instruction","instruction"));const h=s("dl");[["sourceSpeedLabel","sourceSpeed"],["sourceTimeLabel","sourceTime"],["sourceBoundaryLabel","sourceBoundary"],["sourceTargetLabel","sourceTarget"]].forEach(([d,L])=>{h.append(u("dt",d),u("dd",L,"math"))}),p.append(h);const g=s("div","classification-grid");g.append(u("p","classificationHeading","eyebrow"));const m=s("div","classification-rows"),x=[["constant","categoryConstant"],["variable","categoryVariable"],["range","categoryRange"],["target","categoryTarget"]],y=[["speed","itemSpeed","constant"],["time","itemTime","variable"],["domain","itemDomain","range"],["area","itemArea","target"]];y.forEach(([d,L,w])=>{const S=s("label","classification-row");S.append(u("strong",L,"math")),S.append(J(`constraint-${d}`,t.constraints[d]??"",x,v=>{t.constraints[d]=v,t.incorrect=t.incorrect.filter(T=>T!==d),t.feedbackKey="",$(`constraint-${d}`)},t.incorrect.includes(d)&&t.constraints[d]!==w)),m.append(S)}),g.append(m);const f=s("div","row-actions"),M=_("submitLabel","action","constraints-submit",()=>{const d=y.filter(([L,,w])=>t.constraints[L]!==w).map(([L])=>L);if(d.length>0){t.attempts+=1,t.incorrect=d,t.feedbackKey="repairStatus",e.emit("constraints.repair",{attempts:t.attempts,incorrect:d}),$("constraints-submit");return}W({attempts:t.attempts+1,classifications:{...t.constraints}}),$()});M.disabled=!H()||y.some(([d])=>!t.constraints[d]),f.append(M,Z("initialStatus")),g.append(f),c.append(p,g),l.append(c)}function de(l){const c=s("section","model-layout"),p=s("div","assembly-board");p.append(u("p","kicker","eyebrow"));const h=s("div","assembly-rows"),g=[{id:"ap",labelKey:"slotAp",correct:"apCorrect",options:[["apCorrect","apCorrect"],["apPlus","apPlus"],["apReverse","apReverse"]]},{id:"bq",labelKey:"slotBq",correct:"bqCorrect",options:[["bqCorrect","bqCorrect"],["bqForward","bqForward"],["bqPlus","bqPlus"]]},{id:"domain",labelKey:"slotDomain",correct:"domainCorrect",options:[["domainCorrect","domainCorrect"],["domainLong","domainLong"],["domainOpen","domainOpen"]]},{id:"area",labelKey:"slotArea",correct:"areaCorrect",options:[["areaCorrect","areaCorrect"],["areaDouble","areaDouble"],["areaSum","areaSum"]]}];g.forEach(d=>{const L=s("label","assembly-row");L.append(u("strong",d.labelKey,"math")),L.append(J(`model-${d.id}`,t.model[d.id]??"",d.options,w=>{t.model[d.id]=w,t.incorrect=t.incorrect.filter(S=>S!==d.id),t.feedbackKey="",$(`model-${d.id}`)},t.incorrect.includes(d.id)&&t.model[d.id]!==d.correct)),h.append(L)}),p.append(h);const m=s("div","row-actions"),x=_("submitLabel","action","model-submit",()=>{const d=g.filter(({id:L,correct:w})=>t.model[L]!==w).map(({id:L})=>L);if(d.length>0){t.attempts+=1,t.incorrect=d,t.feedbackKey="repairStatus",e.emit("model.repair",{attempts:t.attempts,incorrect:d}),$("model-submit");return}W({attempts:t.attempts+1,selections:{...t.model}}),$()});x.disabled=!H()||g.some(({id:d})=>!t.model[d]),m.append(x,Z("initialStatus")),p.append(m);const y=s("aside","model-preview");y.append(u("p","previewHeading","eyebrow"));const f=s("div","large-formula math");t.completed||r.phase==="model_complete"?f.append("S(t) = ","6t − ",Object.assign(s("em"),{textContent:"1.5t²"})):(f.textContent=P("previewPlaceholder"),f.dataset.coursewareEditKey="content.previewPlaceholder");const M=u("span","previewDomain","domain-seal math");y.append(f,M,u("p","previewNote","muted")),c.append(p,y),l.append(c)}function se(l,c){const p=D("svg",{class:"domain-graph",viewBox:"0 0 650 340",role:"img","aria-label":P("graphAriaLabel")}),h=D("line",{x1:58,y1:286,x2:622,y2:286,stroke:r.palette.ink,"stroke-width":2}),g=D("line",{x1:58,y1:286,x2:58,y2:28,stroke:r.palette.ink,"stroke-width":2}),m=(w,S)=>({x:58+w/7*540,y:286-S/19*228}),x=Array.from({length:101},(w,S)=>{const v=7*S/100,T=m(v,ie(c,v));return`${S===0?"M":"L"}${T.x.toFixed(2)} ${T.y.toFixed(2)}`}).join(" "),y=Array.from({length:81},(w,S)=>{const v=4*S/80,T=m(v,ie(c,v));return`${S===0?"M":"L"}${T.x.toFixed(2)} ${T.y.toFixed(2)}`}).join(" ");p.append(h,g,D("path",{d:x,fill:"none",stroke:r.palette.line,"stroke-width":3,"stroke-dasharray":"8 8"}),D("path",{d:y,fill:"none",stroke:r.palette.blue,"stroke-width":5}));const f=m(4,ie(c,4)),M=j({...c,domain:[0,7]}),d=m(M.input,M.value);p.append(D("line",{x1:f.x,x2:f.x,y1:f.y,y2:286,stroke:r.palette.red,"stroke-width":2,"stroke-dasharray":"5 5"}),D("circle",{cx:f.x,cy:f.y,r:7,fill:r.palette.red}),D("circle",{cx:d.x,cy:d.y,r:6,fill:r.palette.paper,stroke:r.palette.muted,"stroke-width":2})),[[58,310,"0"],[f.x,310,"4"],[d.x,310,"6"]].forEach(([w,S,v])=>{const T=D("text",{x:w,y:S,fill:v==="4"?r.palette.red:r.palette.muted,"font-size":18,"text-anchor":"middle","font-family":"Cambria, serif"});T.textContent=String(v),p.append(T)});const L=D("text",{x:158,y:330,fill:r.palette.blue,"font-size":16,"font-weight":700,"font-family":"Microsoft YaHei, sans-serif"});L.textContent=P("feasibleDomainLabel"),p.append(L),l.append(p)}function ce(l){const c=Oe(r.model,"domainVariant"),p=j(c),h=s("section","domain-layout"),g=s("div","domain-graph-panel");g.append(u("p","kicker","eyebrow")),se(g,c);const m=s("div","domain-task");m.append(u("p","instruction","instruction"),u("p","domainPrompt","muted"));const x=s("div","domain-options");[["vertex","optionVertex"],["endpoint","optionEndpoint"],["midpoint","optionMidpoint"]].forEach(([f,M])=>{const d=_(M,"choice",`domain-${f}`,()=>{t.domain=f,t.feedbackKey="",$(`domain-${f}`)});d.dataset.selected=String(t.domain===f),d.dataset.wrong=String(t.incorrect.includes("domain")&&t.domain===f&&f!=="endpoint"),d.setAttribute("aria-pressed",String(t.domain===f)),x.append(d)}),m.append(x);const y=_("submitLabel","action","domain-submit",()=>{if(t.domain!=="endpoint"){t.attempts+=1,t.incorrect=["domain"],t.feedbackKey="repairStatus",e.emit("domain.repair",{attempts:t.attempts,selection:t.domain}),$("domain-submit");return}W({attempts:t.attempts+1,maximum:p}),$()});if(y.disabled=!H()||!t.domain,m.append(y),t.completed||r.phase==="domain_complete"){const f=s("p","domain-conclusion");f.textContent=Le(P("conclusionTemplate"),{value:fe(p.value),input:fe(p.input)}),m.append(f)}m.append(Z("initialStatus")),h.append(g,m),l.append(h)}function le(l,c){const p=j(c),h=c.linear-c.quadratic*p.input,g=D("svg",{viewBox:"0 0 480 310",role:"img","aria-label":P("geometryAriaLabel")});g.append(D("line",{x1:54,y1:258,x2:434,y2:258,stroke:r.palette.ink,"stroke-width":2}),D("line",{x1:54,y1:258,x2:54,y2:32,stroke:r.palette.ink,"stroke-width":2}),D("line",{x1:54,y1:50,x2:420,y2:258,stroke:r.palette.muted,"stroke-width":2,"stroke-dasharray":"7 7"}),D("rect",{x:54,y:133,width:214,height:125,fill:r.palette.redSoft,stroke:r.palette.red,"stroke-width":3}),D("line",{x1:268,y1:133,x2:420,y2:258,stroke:r.palette.blue,"stroke-width":4}),D("circle",{cx:268,cy:133,r:7,fill:r.palette.blue})),[[160,284,Le(P("xValueTemplate"),{value:fe(p.input)}),r.palette.blue,"middle"],[280,196,Le(P("yValueTemplate"),{value:fe(h)}),r.palette.blue,"start"],[72,86,P("lineRelationLabel"),r.palette.muted,"start"],[125,188,P("targetRegionLabel"),r.palette.red,"start"]].forEach(([m,x,y,f,M])=>{const d=D("text",{x:m,y:x,fill:f,"font-size":17,"font-family":"Cambria, Microsoft YaHei, serif","text-anchor":M});d.textContent=y,g.append(d)}),l.append(g)}function me(l){const c=Oe(r.model,"transfer"),p=j(c),h=c.linear-c.quadratic*p.input,g=s("section","transfer-layout"),m=s("div","transfer-geometry");m.append(u("p","kicker","eyebrow")),le(m,c);const x=s("div","transfer-task");x.append(u("p","instruction","instruction"));const y=s("div","transfer-selects"),f=u("label","formulaSlot");f.append(J("transfer-formula",t.transfer.formula??"",[["formulaCorrect","formulaCorrect"],["formulaTriangle","formulaTriangle"],["formulaLinear","formulaLinear"]],v=>{t.transfer.formula=v,t.feedbackKey="",$("transfer-formula")},t.incorrect.includes("formula")&&t.transfer.formula!=="formulaCorrect"));const M=u("label","resultSlot");M.append(J("transfer-result",t.transfer.result??"",[["resultCorrect","resultCorrect"],["resultVertex","resultVertex"],["resultEndpoint","resultEndpoint"]],v=>{t.transfer.result=v,t.feedbackKey="",$("transfer-result")},t.incorrect.includes("result")&&t.transfer.result!=="resultCorrect")),y.append(f,M),(t.hintShown||r.phase==="transfer_hint"||r.phase==="transfer_complete")&&y.append(u("p","hintText","hint-strip")),x.append(y);const d=s("div"),L=s("div","transfer-actions"),w=_("hintLabel","action secondary","transfer-hint",()=>{const v=Number(e.courseState?.get(ge)??0)+1;e.courseState?.set(ge,v),t.hintShown=!0,e.emit("transfer.hint",{hintCount:v}),$("transfer-hint")});w.disabled=!H()||t.hintShown;const S=_("submitLabel","action","transfer-submit",()=>{const v=[...t.transfer.formula==="formulaCorrect"?[]:["formula"],...t.transfer.result==="resultCorrect"?[]:["result"]];if(v.length>0){t.attempts+=1,t.incorrect=v,t.feedbackKey=v.includes("formula")?"repairFormulaStatus":"repairResultStatus";let T=Number(e.courseState?.get(ge)??0);t.hintShown||(T+=1,e.courseState?.set(ge,T),t.hintShown=!0),e.emit("transfer.repair",{attempts:t.attempts,incorrect:v,hintCount:T}),$("transfer-submit");return}W({attempts:t.attempts+1,maximum:{input:p.input,value:p.value,pairedValue:h}}),$()});S.disabled=!H()||!t.transfer.formula||!t.transfer.result,L.append(w,S),d.append(L,Z("initialStatus")),x.append(d),g.append(m,x),l.append(g)}function xe(l){const c=s("section","summary-layout"),p=s("div","evidence-ribbon");[["evidenceBaseLabel","evidenceBase"],["evidenceDomainLabel","evidenceDomain"],["evidenceTransferLabel","evidenceTransfer"]].forEach(([w,S])=>{const v=s("article");v.append(u("span",w),u("strong",S,"math")),p.append(v)});const h=s("div","method-workbench");h.append(u("p","instruction","instruction"));const g=["constraints","variables","relation","domain","interpret"],m=["relation","constraints","interpret","variables","domain"],x=s("div","method-slots");g.forEach((w,S)=>{const v=s("div","method-slot"),T=t.summary[S];v.dataset.filled=String(!!T);const re=s("b");re.textContent=String(S+1).padStart(2,"0"),v.append(re),T?v.append(u("span",`step.${T}`)):v.append(u("span","emptySlot")),x.append(v)});const y=s("div","method-bank");m.forEach(w=>{const S=_(`step.${w}`,"step-chip",`summary-${w}`,()=>{t.summary.includes(w)||t.summary.length>=g.length||(t.summary.push(w),t.feedbackKey="",$(`summary-${w}`))});S.dataset.selected=String(t.summary.includes(w)),S.disabled=!H()||t.summary.includes(w),y.append(S)}),h.append(x,y);const f=s("div","summary-actions"),M=_("undoLabel","action secondary","summary-undo",()=>{t.summary.pop(),t.feedbackKey="",$("summary-undo")});M.disabled=!H()||t.summary.length===0;const d=_("resetLabel","action secondary","summary-reset",()=>{t.summary=[],t.feedbackKey="",$("summary-reset")});d.disabled=!H()||t.summary.length===0;const L=_("submitLabel","action","summary-submit",()=>{if(t.summary.join("|")!==g.join("|")){t.attempts+=1,t.feedbackKey="repairStatus",$("summary-submit");return}W({sequence:[...t.summary],attempts:t.attempts+1}),$()});if(L.disabled=!H()||t.summary.length!==g.length,f.append(M,d,L,Z("initialStatus")),h.append(f),c.append(p,h),t.completed||r.phase==="summary_complete"){const w=s("div","completion-band");w.append(u("strong","completionMark"),u("span","completeStatus")),c.append(w)}l.append(c)}function $(l=""){if(A)return;X(),R(),G(),n.setAttribute("aria-label",P("ariaLabel")),n.setAttribute("aria-hidden",String(!I));const c=yt(a),p=s("div","lab-sheet");if(p.dataset.mode=r.mode,r.mode==="prediction"&&ae(p),r.mode==="constraints"&&pe(p),r.mode==="model"&&de(p),r.mode==="domain"&&ce(p),r.mode==="transfer"&&me(p),r.mode==="summary"&&xe(p),r.mode!=="summary"&&P("nextLabel")&&(t.completed||be(r.mode,r.phase))){p.classList.add("has-next");const h=_("nextLabel","action component-next","course-next",()=>{e.emit("navigation.next",{mode:r.mode})});h.disabled=i!=="preview"||N,p.append(h)}n.replaceChildren(c,p),l&&i==="preview"&&queueMicrotask(()=>{A||n.querySelector(`[data-focus-key="${l}"]`)?.focus({preventScroll:!0})})}return $(),{setMode(l){i=l,$()},resize(l,c){V=l,Y=c,G()},updateProps(l){r=l,$()},setVisible(l){I=l,n.style.display=I?"block":"none",n.setAttribute("aria-hidden",String(!I))},suspend(){N=!0,$()},resume(){N=!1,$()},prepareCapture(){X(),$(),n.dataset.captureReady="true"},destroy(){A||(A=!0,n.classList.remove(a),n.replaceChildren())}}}var kt="http://www.w3.org/2000/svg",Ye=.051;function q(e){const n=Math.abs(e)<1e-9?0:Math.round(e*100)/100;return Number.isInteger(n)?String(n):String(n).replace(/0+$/,"")}function k(e,n={}){const a=document.createElementNS(kt,e);for(const[r,i]of Object.entries(n))a.setAttribute(r,String(i));return a}function he(e,n,a){const r=document.createDocumentFragment();for(const i of n){const V=document.createElement(i.superscript?"sup":"span");V.textContent=i.text,i.tone&&(V.dataset.tone=i.tone),r.append(V)}e.replaceChildren(r),e.setAttribute("aria-label",a)}function $t(e){const n=document.createElement("style");return n.textContent=`
    .${e} {
      --paper: #FBF8F1;
      --ink: #16191F;
      --muted: #74777C;
      --line: #C9CDD2;
      --blue: #145DCE;
      --blue-soft: #DCE9FF;
      --red: #E04424;
      --red-soft: #F8D9CF;
      --focus: #0A53BE;
      width: 100%;
      height: 100%;
      color: var(--ink);
      background: transparent;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
      container-type: size;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .${e} * { box-sizing: border-box; }
    .${e} .motion-sheet {
      display: grid;
      grid-template-columns: minmax(274px, 0.43fr) minmax(520px, 1fr);
      gap: clamp(22px, 3cqw, 42px);
      width: 100%;
      height: 100%;
      padding: 2px 4px 0;
      overflow: hidden;
    }
    .${e} .formula-column {
      min-width: 0;
      padding: 2px clamp(18px, 2.2cqw, 30px) 0 0;
      border-right: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
      display: flex;
      flex-direction: column;
    }
    .${e} .kicker {
      margin: 0 0 5px;
      color: var(--blue);
      font-size: clamp(11px, 1.1cqw, 14px);
      font-weight: 700;
      letter-spacing: 0.14em;
    }
    .${e} h3 {
      margin: 0;
      font-size: clamp(16px, 1.45cqw, 20px);
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .${e} .relation-list {
      display: grid;
      gap: clamp(7px, 1cqh, 12px);
      margin: clamp(14px, 2.4cqh, 23px) 0 0;
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: clamp(20px, 2.15cqw, 29px);
      line-height: 1.12;
    }
    .${e} .relation-row {
      display: grid;
      grid-template-columns: minmax(0, max-content) 1fr;
      align-items: center;
      gap: 13px;
      white-space: nowrap;
    }
    .${e} .relation-row::after {
      content: "";
      min-width: 24px;
      border-top: 1px dashed var(--line);
      transform: translateY(2px);
    }
    .${e} [data-tone="blue"] { color: var(--blue); }
    .${e} [data-tone="red"] { color: var(--red); }
    .${e} .area-formula {
      margin-top: clamp(18px, 3.2cqh, 30px);
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: clamp(30px, 3.55cqw, 47px);
      line-height: 1.1;
      white-space: nowrap;
    }
    .${e} .area-formula sup {
      font-size: 0.52em;
      vertical-align: 0.72em;
    }
    .${e} .live-equation {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-top: clamp(10px, 2cqh, 18px);
      padding-top: clamp(9px, 1.6cqh, 15px);
      border-top: 1px solid var(--line);
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
    }
    .${e} .live-equation strong {
      color: var(--red);
      font-size: clamp(23px, 2.6cqw, 35px);
      font-weight: 500;
    }
    .${e} .live-equation span {
      color: var(--muted);
      font-size: clamp(14px, 1.45cqw, 18px);
    }
    .${e} .checkpoints {
      margin-top: auto;
      padding-top: 10px;
    }
    .${e} .checkpoint-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: clamp(10px, 1cqw, 12px);
      letter-spacing: 0.05em;
    }
    .${e} .checkpoint-list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-top: 7px;
    }
    .${e} .checkpoint {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      color: var(--muted);
      font-size: clamp(10px, 1cqw, 12px);
    }
    .${e} .checkpoint::before {
      content: "";
      width: 7px;
      height: 7px;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--paper);
    }
    .${e} .checkpoint[data-seen="true"] { color: var(--blue); }
    .${e} .checkpoint[data-seen="true"]::before {
      border-color: var(--blue);
      background: var(--blue);
      box-shadow: 0 0 0 2px var(--blue-soft);
    }
    .${e} .confirm-button {
      width: 100%;
      min-height: 42px;
      margin-top: clamp(10px, 1.6cqh, 15px);
      padding: 9px 14px;
      border: 1px solid var(--blue);
      border-radius: 2px;
      color: #fff;
      background: var(--blue);
      font: 700 clamp(12px, 1.1cqw, 14px)/1.35 "Microsoft YaHei", sans-serif;
      letter-spacing: 0.03em;
      cursor: pointer;
    }
    .${e} .confirm-button:disabled {
      border-color: var(--line);
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 82%, var(--line));
      cursor: not-allowed;
    }
    .${e} .confirm-button:focus-visible,
    .${e} input[type="range"]:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--focus) 35%, transparent);
      outline-offset: 3px;
    }
    .${e} .visual-column {
      display: grid;
      grid-template-rows: minmax(205px, 1.18fr) minmax(175px, 0.92fr);
      gap: clamp(8px, 1.5cqh, 15px);
      min-width: 0;
      min-height: 0;
    }
    .${e} .visual-section {
      position: relative;
      min-width: 0;
      min-height: 0;
    }
    .${e} .section-heading {
      position: absolute;
      z-index: 2;
      top: 0;
      left: 0;
      margin: 0;
      color: var(--muted);
      font-size: clamp(10px, 0.95cqw, 12px);
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .${e} svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .${e} .diagram-text {
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      fill: var(--ink);
      font-size: 16px;
    }
    .${e} .diagram-text[data-tone="blue"] { fill: var(--blue); }
    .${e} .diagram-text[data-tone="red"] { fill: var(--red); }
    .${e} .diagram-text[data-tone="muted"] { fill: var(--muted); }
    .${e} .geometry-outline,
    .${e} .graph-axis { stroke: var(--ink); stroke-width: 1.5; fill: none; }
    .${e} .area-region {
      fill: var(--red-soft);
      fill-opacity: 0.76;
      stroke: var(--red);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .${e} .variable-line { stroke: var(--blue); stroke-width: 2.4; }
    .${e} .guide-line { stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 4 4; }
    .${e} .active-guide { stroke: var(--red); stroke-width: 1.1; stroke-dasharray: 4 4; }
    .${e} .motion-point { fill: var(--blue); stroke: var(--paper); stroke-width: 2; }
    .${e} .graph-curve { fill: none; stroke: var(--red); stroke-width: 2.6; }
    .${e} .graph-point { fill: var(--red); stroke: var(--paper); stroke-width: 2.4; }
    .${e} .control-row {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 42px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 15px;
    }
    .${e} input[type="range"] {
      width: 100%;
      height: 22px;
      margin: 0;
      accent-color: var(--blue);
      cursor: ew-resize;
    }
    .${e} input[type="range"]:disabled { cursor: not-allowed; opacity: 0.58; }
    .${e} .time-readout {
      min-width: 74px;
      color: var(--red);
      font: 500 clamp(19px, 2cqw, 26px)/1 "Cambria Math", Cambria, serif;
      text-align: right;
      white-space: nowrap;
    }
    .${e} .keyboard-hint {
      position: absolute;
      left: 42px;
      bottom: 27px;
      color: var(--muted);
      font-size: clamp(11px, 0.92cqw, 12px);
      line-height: 1.2;
    }
    .${e} .sr-status {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .${e}[data-reduced-motion="true"] * {
      scroll-behavior: auto !important;
      transition: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .${e} * { scroll-behavior: auto !important; transition: none !important; }
    }
    @container (max-width: 920px) {
      .${e} .motion-sheet { grid-template-columns: minmax(240px, 0.42fr) minmax(420px, 1fr); gap: 18px; }
      .${e} .formula-column { padding-right: 16px; }
      .${e} .relation-list { font-size: 19px; }
      .${e} .area-formula { font-size: 30px; }
      .${e} .visual-column { grid-template-rows: 1.12fr 0.88fr; }
    }
  `,n}function Ge(e){return"base"in e.model?e.model.base:e.model}function St(e){if(e.renderMode!=="dom")throw new Error("motion-function-lab requires renderMode=dom");if(e.scope!=="scene")throw new Error("motion-function-lab supports scene scope only");const n=`motion-function-lab-${e.instanceId.replace(/[^a-zA-Z0-9_-]/g,"-")}`,a=e.dom.root;a.replaceChildren(),a.classList.add(n),a.setAttribute("role","group");let r=e.props,i=Ge(r)??_e,V=e.mode,Y=e.width,I=e.height,N=!0,A=!1,t=!1,P=!1,u=0,H=null,R=i.tMin,G=r.phase==="proved",X="";const O=new Set([i.tMin]),Z=$t(n),_=document.createElement("div");_.className="motion-sheet";const W=document.createElement("section");W.className="formula-column";const ae=document.createElement("p");ae.className="kicker";const J=document.createElement("h3"),pe=document.createElement("div");pe.className="relation-list";const de=document.createElement("div");de.className="relation-row";const se=document.createElement("div");se.className="relation-row";const ce=document.createElement("div");ce.className="relation-row",pe.append(de,se,ce);const le=document.createElement("div");le.className="area-formula";const me=document.createElement("div");me.className="live-equation";const xe=document.createElement("span"),$=document.createElement("strong");me.append(xe,$);const l=document.createElement("div");l.className="checkpoints";const c=document.createElement("div");c.className="checkpoint-title";const p=document.createElement("span"),h=document.createElement("span");c.append(p,h);const g=document.createElement("div");g.className="checkpoint-list";const m=[0,2,4].map(o=>{const b=document.createElement("div");return b.className="checkpoint",b.dataset.checkpoint=String(o),g.append(b),b});l.append(c,g);const x=document.createElement("button");x.type="button",x.className="confirm-button",W.append(ae,J,pe,le,me,l,x);const y=document.createElement("div");y.className="visual-column";const f=document.createElement("section");f.className="visual-section";const M=document.createElement("p");M.className="section-heading";const d=k("svg",{viewBox:"0 0 650 220",role:"img",preserveAspectRatio:"xMidYMid meet"}),L=k("polygon",{class:"area-region"}),w=k("path",{class:"geometry-outline",d:"M42 182 L586 182 L586 24 L42 24 Z"}),S=k("line",{class:"variable-line",x1:42,y1:182,y2:182}),v=k("line",{class:"variable-line",x1:586,x2:586,y1:182,"stroke-dasharray":"5 4"}),T=k("line",{class:"guide-line",y1:182,y2:210}),re=k("line",{class:"guide-line",x1:586,x2:621}),We=k("circle",{class:"motion-point",r:6.5,cy:182}),Qe=k("circle",{class:"motion-point",r:6.5,cx:586}),F={a:k("text",{class:"diagram-text",x:27,y:199}),b:k("text",{class:"diagram-text",x:592,y:199}),c:k("text",{class:"diagram-text",x:592,y:25}),d:k("text",{class:"diagram-text",x:27,y:25}),p:k("text",{class:"diagram-text","data-tone":"blue",y:174}),q:k("text",{class:"diagram-text","data-tone":"blue",x:598}),ap:k("text",{class:"diagram-text","data-tone":"blue",y:211,"text-anchor":"middle"}),bq:k("text",{class:"diagram-text","data-tone":"blue",x:642,"text-anchor":"end"}),area:k("text",{class:"diagram-text","data-tone":"red",x:58,y:49})};d.append(L,w,S,v,T,re,We,Qe,F.a,F.b,F.c,F.d,F.p,F.q,F.ap,F.bq,F.area),f.append(M,d);const qe=document.createElement("section");qe.className="visual-section";const Ae=document.createElement("p");Ae.className="section-heading";const Pe=k("svg",{viewBox:"0 0 650 196",role:"img",preserveAspectRatio:"xMidYMid meet"}),Mt=k("line",{class:"graph-axis",x1:42,y1:126,x2:625,y2:126}),Et=k("line",{class:"graph-axis",x1:42,y1:126,x2:42,y2:18}),Ue=k("path",{class:"graph-curve"}),ye=k("line",{class:"active-guide",y2:126}),ve=k("line",{class:"active-guide",x1:42}),Ne=k("circle",{class:"graph-point",r:6.3}),ue=k("text",{class:"diagram-text","data-tone":"red",x:365,y:36}),Xe=k("text",{class:"diagram-text",x:631,y:132}),Ze=k("text",{class:"diagram-text",x:29,y:16});Pe.append(Mt,Et,Ue,ye,ve,Ne,ue,Xe,Ze);const Te=k("g");Pe.append(Te);const Fe=document.createElement("div");Fe.className="control-row";const E=document.createElement("input");E.type="range",E.step="0.1";const ze=document.createElement("output");ze.className="time-readout";const He=document.createElement("span");He.className="keyboard-hint",Fe.append(E,ze),qe.append(Ae,Pe,He,Fe),y.append(f,qe);const oe=document.createElement("p");oe.className="sr-status",oe.setAttribute("aria-live","polite"),oe.setAttribute("aria-atomic","true"),_.append(W,y),a.append(Z,_,oe);function Je(){const o=r.palette;a.style.setProperty("--paper",o.paper),a.style.setProperty("--ink",o.ink),a.style.setProperty("--muted",o.muted),a.style.setProperty("--line",o.line),a.style.setProperty("--blue",o.blue),a.style.setProperty("--blue-soft",o.blueSoft),a.style.setProperty("--red",o.red),a.style.setProperty("--red-soft",o.redSoft),a.style.setProperty("--focus",o.focus),a.dataset.reducedMotion=String(!!r.reducedMotion)}function we(o,b){const z=j(U(i)),K=Math.max(1,z.value*1.12);return{x:42+(o-i.tMin)/(i.tMax-i.tMin)*568,y:126-b/K*100}}function Lt(){const o=U(i),b=gt(o).map(({input:B,value:C},ee)=>{const te=we(B,C);return`${ee===0?"M":"L"}${te.x.toFixed(2)} ${te.y.toFixed(2)}`}).join(" ");Ue.setAttribute("d",b),Te.replaceChildren();const z=i.tMax-i.tMin,K=Math.min(8,Math.max(2,Math.round(z)));for(let B=0;B<=K;B+=1){const C=i.tMin+z*(B/K),ee=we(C,0),te=k("line",{class:"guide-line",x1:ee.x,x2:ee.x,y1:122,y2:130}),Se=k("text",{class:"diagram-text","data-tone":Math.abs(C-j(o).input)<Ye?"red":"muted",x:ee.x,y:148,"text-anchor":"middle"});Se.textContent=q(C),Te.append(te,Se)}}function et(){const o=r.content,b=U(i),z=j(b);a.setAttribute("aria-label",o.ariaLabel),ae.textContent=o.kicker,J.textContent=o.formulaHeading,M.textContent=o.geometryHeading,Ae.textContent=o.graphHeading,p.textContent=o.checkpointLabel,He.textContent=o.keyboardHint,F.a.textContent=o.pointA,F.b.textContent=o.pointB,F.c.textContent=o.pointC,F.d.textContent=o.pointD,F.p.textContent=o.pointP,F.q.textContent=o.pointQ,F.area.textContent=o.areaRegionLabel,ue.textContent=o.maximumLabel,Xe.textContent="t",Ze.textContent="S(t)",E.min=String(i.tMin),E.max=String(i.tMax),E.setAttribute("aria-label",o.dragInstruction),E.setAttribute("aria-valuemin",String(i.tMin)),E.setAttribute("aria-valuemax",String(i.tMax)),he(de,[{text:`${o.apLabel} = `},{text:`${q(i.pSpeed)}t`,tone:"blue"}],`${o.apLabel} 等于 ${q(i.pSpeed)}t`),he(se,[{text:`${o.bqLabel} = `},{text:`${q(i.rectangleHeight)} − ${q(i.qSpeed)}t`,tone:"blue"}],`${o.bqLabel} 等于 ${q(i.rectangleHeight)} 减 ${q(i.qSpeed)}t`),he(ce,[{text:`${q(i.tMin)} ≤ t ≤ ${q(i.tMax)}`,tone:"blue"}],`${o.domainLabel}：${q(i.tMin)} 小于等于 t 小于等于 ${q(i.tMax)}`),he(le,[{text:"S(t) = "},{text:`${q(b.linear)}t`,tone:"blue"},{text:" − "},{text:`${q(b.quadratic)}t`,tone:"red"},{text:"2",tone:"red",superscript:!0}],`S t 等于 ${q(b.linear)}t 减 ${q(b.quadratic)}t 的平方`),m.forEach((K,B)=>{const C=[i.tMin,z.input,i.tMax][B]??0;K.dataset.checkpoint=String(C),K.textContent=`t = ${q(C)}`}),Lt()}function qt(o){const b=j(U(i));for(const z of[i.tMin,b.input,i.tMax])Math.abs(o-z)<=Ye&&O.add(z)}function tt(){const o=j(U(i));return[i.tMin,o.input,i.tMax].every(b=>O.has(b))}function At(){const o=r.content;if(G||r.phase==="proved")return o.provedStatus;if(A)return o.suspendedHint;if(V!=="preview")return o.disabledHint;if(X)return X;const b=j(U(i)),z=O.has(i.tMin)&&O.has(i.tMax);return tt()?o.readyStatus:z&&!O.has(b.input)?o.endpointsStatus:o.exploreStatus}function Q(){if(t)return;const o=Ve(i,R),b=j(U(i)),z=42+o.p.x/i.rectangleWidth*544,K=182-o.q.y/i.rectangleHeight*158;L.setAttribute("points",`42,182 ${z},182 586,${K}`),S.setAttribute("x2",String(z)),v.setAttribute("y2",String(K)),T.setAttribute("x1",String(z)),T.setAttribute("x2",String(z)),re.setAttribute("y1",String(K)),re.setAttribute("y2",String(K)),We.setAttribute("cx",String(z)),Qe.setAttribute("cy",String(K)),F.p.setAttribute("x",String(Math.max(48,z-5))),F.q.setAttribute("y",String(K<45?K+25:K-9)),F.ap.setAttribute("x",String(42+(z-42)/2)),F.ap.textContent=`${r.content.apLabel} = ${q(o.ap)}`,F.bq.setAttribute("y",String(K+(182-K)/2+5)),F.bq.textContent=`${r.content.bqLabel} = ${q(o.bq)}`;const B=we(o.t,o.area);Ne.setAttribute("cx",String(B.x)),Ne.setAttribute("cy",String(B.y)),ye.setAttribute("x1",String(B.x)),ye.setAttribute("x2",String(B.x)),ye.setAttribute("y1",String(B.y)),ve.setAttribute("x2",String(B.x)),ve.setAttribute("y1",String(B.y)),ve.setAttribute("y2",String(B.y));const C=we(b.input,b.value);ue.setAttribute("x",String(Math.min(515,C.x+14))),ue.setAttribute("y",String(Math.max(26,C.y-7))),ue.setAttribute("visibility",G||r.phase==="proved"?"visible":"hidden"),E.value=String(o.t),E.setAttribute("aria-valuenow",q(o.t)),E.setAttribute("aria-valuetext",`${r.content.timeLabel} ${q(o.t)}，${r.content.areaLabel} ${q(o.area)}`),ze.value=`t = ${q(o.t)}`,xe.textContent=`${r.content.timeLabel} = ${q(o.t)}`,$.textContent=`S = ${q(o.area)}`;const ee=At();oe.textContent=`${ee}。${r.content.timeLabel} ${q(o.t)}，${r.content.areaLabel} ${q(o.area)}`;const te=[i.tMin,b.input,i.tMax];m.forEach((Me,Pt)=>{const Nt=te[Pt]??0,mt=O.has(Nt);Me.dataset.seen=String(mt),Me.title=mt?r.content.checkpointSeen:r.content.checkpointPending});const Se=te.filter(Me=>O.has(Me)).length;h.textContent=`${Se} / 3`;const ct=V==="preview"&&!A&&!G,lt=!!r.content.nextLabel&&(G||r.phase==="proved")&&V==="preview"&&!A;E.disabled=!ct,x.disabled=lt?!1:!ct||!tt(),x.textContent=lt?r.content.nextLabel:G||r.phase==="proved"?r.content.confirmedLabel:r.content.confirmLabel}function ke(o,b=!0){R=Math.min(i.tMax,Math.max(i.tMin,o)),qt(R),X="",Q(),b||(oe.textContent="")}function De(){if(u!==0&&(cancelAnimationFrame(u),u=0),H!==null){const o=H;H=null,ke(o)}}const rt=()=>{const o=Number(E.value);if(Number.isFinite(o)){if(!P){ke(o);return}H=o,u===0&&(u=requestAnimationFrame(()=>{if(u=0,H===null)return;const b=H;H=null,ke(b)}))}},ot=o=>{o.stopPropagation(),P=!0,E.focus({preventScroll:!0})},$e=o=>{o.stopPropagation(),P=!1,De()},nt=o=>{o.stopPropagation(),E.focus({preventScroll:!0})},it=o=>{if(o.stopPropagation(),E.disabled)return;const b=Number(E.step)||.1,z={ArrowLeft:R-b,ArrowDown:R-b,ArrowRight:R+b,ArrowUp:R+b,PageDown:R-b*10,PageUp:R+b*10,Home:i.tMin,End:i.tMax}[o.key];z!==void 0&&(o.preventDefault(),ke(Math.round(z*10)/10))},at=()=>{if(x.disabled||t)return;if((G||r.phase==="proved")&&r.content.nextLabel){e.emit("navigation.next",{mode:"linked-graph"});return}const o=j(U(i)),b=Ve(i,R);if(Math.abs(R-o.input)>.11||Math.abs(b.area-o.value)>.11){X=r.content.wrongPeakStatus,Q();return}G=!0,X="",Q(),e.emit("linked.mastered",{t:b.t,area:b.area,maximum:o,visited:[i.tMin,o.input,i.tMax]})},pt=o=>{o.stopPropagation(),at()},dt=o=>{o.stopPropagation(),!(o.key!=="Enter"&&o.key!==" ")&&(o.preventDefault(),at())};E.addEventListener("input",rt),E.addEventListener("pointerdown",ot),E.addEventListener("pointerup",$e),E.addEventListener("pointercancel",$e),E.addEventListener("click",nt),E.addEventListener("keydown",it),x.addEventListener("click",pt),x.addEventListener("keydown",dt);function Ke(){const o=j(U(i));r.phase==="proved"&&(G=!0,O.add(i.tMin),O.add(o.input),O.add(i.tMax),R=o.input)}function st(){a.style.width=`${Math.max(1,Y)}px`,a.style.height=`${Math.max(1,I)}px`}return Je(),Ke(),st(),et(),Q(),{setMode(o){V=o,Q()},resize(o,b){Y=o,I=b,st(),Q()},updateProps(o){r=o,i=Ge(r)??_e,Je(),Ke(),et(),R=Math.min(i.tMax,Math.max(i.tMin,R)),Q()},setVisible(o){N=o,a.style.display=N?"block":"none",a.setAttribute("aria-hidden",String(!N))},suspend(){A=!0,P=!1,De(),Q()},resume(){A=!1,Q()},prepareCapture(){De(),Ke(),Q(),a.dataset.captureReady="true"},destroy(){t||(t=!0,u!==0&&cancelAnimationFrame(u),u=0,H=null,E.removeEventListener("input",rt),E.removeEventListener("pointerdown",ot),E.removeEventListener("pointerup",$e),E.removeEventListener("pointercancel",$e),E.removeEventListener("click",nt),E.removeEventListener("keydown",it),x.removeEventListener("click",pt),x.removeEventListener("keydown",dt),a.classList.remove(n),a.replaceChildren())}}}function Ce(e){let n=e.props,a=e.mode,r=e.width,i=e.height,V=!0,Y=!1;const I=()=>{const A={...e,width:r,height:i,mode:a,props:n};if(n.mode==="linked-graph")return St(A);if(vt(n.mode))return wt(A);throw new Error(`不支持的动点课程模式：${String(n.mode)}`)};let N=I();return{setMode(A){a=A,N.setMode(A)},resize(A,t){r=A,i=t,N.resize(A,t)},updateProps(A){const t=A.mode!==n.mode;if(n=A,!t){N.updateProps(A);return}N.destroy(),N=I(),V||N.setVisible(!1),Y&&N.suspend()},setVisible(A){V=A,N.setVisible(A)},suspend(){Y=!0,N.suspend()},resume(){Y=!1,N.resume()},prepareCapture(){N.prepareCapture()},destroy(){N.destroy()}}}return globalThis.CoursewareComponent.define({id:"com.ittoedu.math.motion-function-lab",runtimeApiVersion:4,create:Ce}),Ee.createMotionFunctionLab=Ce,Ee})({});
