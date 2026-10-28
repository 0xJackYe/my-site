import { escapeXml } from "./core.mjs";

const palette = {
  paper: "#f3f0e8",
  ink: "#181714",
  muted: "#706b61",
  line: "#b8b0a3",
  faint: "#ded8cc",
  accent: "#a65032",
  white: "#fffdf8",
};

function shell(candidate, language, body) {
  const title = escapeXml(candidate.alt[language]);
  const description = escapeXml(candidate.caption[language]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${candidate.assets[language]?.width ?? 1200}" height="${candidate.assets[language]?.height ?? 675}" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${description}</desc>
  <rect width="1200" height="675" fill="${palette.paper}"/>
  <style>
    text { font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif; fill: ${palette.ink}; letter-spacing: 0; }
    .eyebrow { font-size: 21px; font-weight: 700; }
    .label { font-size: 28px; font-weight: 700; }
    .small { font-size: 17px; fill: ${palette.muted}; }
    .number { font-size: 17px; font-weight: 700; fill: ${palette.accent}; }
    .inverse { fill: ${palette.paper}; }
    .node { fill: ${palette.white}; stroke: ${palette.ink}; stroke-width: 2; }
    .soft { fill: none; stroke: ${palette.line}; stroke-width: 2; }
    .strong { fill: none; stroke: ${palette.ink}; stroke-width: 3; }
    .accent { fill: none; stroke: ${palette.accent}; stroke-width: 4; }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${palette.ink}"/></marker>
    <marker id="arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${palette.accent}"/></marker>
  </defs>
  ${body}
</svg>`;
}

function feedbackLoop(language) {
  const labels = language === "zh"
    ? [["01", "价格变化", "上涨 / 下跌"], ["02", "情绪", "贪婪 / 恐惧"], ["03", "选择性证据", "只看支持观点的信息"], ["04", "投资行动", "追涨 / 恐慌卖出"]]
    : [["01", "Price moves", "Rise / fall"], ["02", "Emotion", "Greed / fear"], ["03", "Selective evidence", "Only confirming signals"], ["04", "Investor action", "Chase / panic-sell"]];
  const nodes = [[120, 120], [760, 120], [760, 405], [120, 405]];
  const boxes = labels.map(([number, label, sub], index) => {
    const [x, y] = nodes[index];
    return `<g><rect class="node" x="${x}" y="${y}" width="320" height="145" rx="3"/><text class="number" x="${x + 24}" y="${y + 34}">${number}</text><text class="label" x="${x + 24}" y="${y + 78}">${escapeXml(label)}</text><text class="small" x="${x + 24}" y="${y + 112}">${escapeXml(sub)}</text></g>`;
  }).join("");
  return `${boxes}
  <path class="strong" d="M440 193 H745" marker-end="url(#arrow)"/>
  <path class="strong" d="M920 265 V390" marker-end="url(#arrow)"/>
  <path class="strong" d="M760 478 H455" marker-end="url(#arrow)"/>
  <path class="accent" d="M280 405 V280" marker-end="url(#arrow-accent)"/>
  <circle cx="600" cy="337" r="80" fill="${palette.ink}"/><text class="inverse" x="600" y="331" text-anchor="middle" style="font-size:${language === "zh" ? 19 : 16}px;font-weight:700">${language === "zh" ? "自我强化" : "SELF-"}</text><text class="inverse" x="600" y="355" text-anchor="middle" style="font-size:${language === "zh" ? 19 : 16}px;font-weight:700">${language === "zh" ? "的循环" : "REINFORCING"}</text>`;
}

function scarcityModel(language) {
  const labels = language === "zh"
    ? [["01", "真实需求", "需要解决的人足够多"], ["02", "有限供给", "真正能解决的人足够少"], ["03", "结果影响", "解决后能改变重要结果"]]
    : [["01", "Real demand", "Enough people need the problem solved"], ["02", "Limited supply", "Few people can solve it well"], ["03", "Outcome impact", "The solution changes a meaningful result"]];
  const cards = labels.map(([n, label, sub], index) => {
    const x = 75 + index * 375;
    const widths = [220, 105, 170];
    return `<g><text class="number" x="${x}" y="120">${n}</text><text class="label" x="${x}" y="158">${escapeXml(label)}</text><text class="small" x="${x}" y="194">${escapeXml(sub)}</text><rect x="${x}" y="235" width="285" height="20" fill="${palette.faint}"/><rect x="${x}" y="235" width="${widths[index]}" height="20" fill="${index === 1 ? palette.accent : palette.ink}"/></g>`;
  }).join("");
  return `${cards}<path class="strong" d="M218 300 V380 H600"/><path class="strong" d="M593 300 V380"/><path class="strong" d="M968 300 V380 H600"/><path class="accent" d="M600 380 V438" marker-end="url(#arrow-accent)"/><rect class="node" x="395" y="470" width="410" height="120" rx="3"/><text class="label" x="600" y="522" text-anchor="middle">${language === "zh" ? "有价值的稀缺能力" : "VALUABLE SCARCITY"}</text><text class="small" x="600" y="557" text-anchor="middle">${language === "zh" ? "困难 ≠ 稀缺" : "DIFFICULT ≠ SCARCE"}</text>`;
}

function skillStack(language) {
  const labels = language === "zh"
    ? [["会编程", "50%"], ["+ 沟通", "20%"], ["+ 英语", "更少"], ["完整能力组合", "稀缺"]]
    : [["Programming", "50%"], ["+ Communication", "20%"], ["+ English", "Fewer"], ["Full skill stack", "Scarce"]];
  const widths = [950, 720, 500, 350];
  const rows = labels.map(([label, amount], index) => {
    const width = widths[index];
    const x = (1200 - width) / 2;
    const y = 105 + index * 120;
    return `<g><rect x="${x}" y="${y}" width="${width}" height="78" rx="3" fill="${index === 3 ? palette.accent : index % 2 ? palette.white : palette.faint}" stroke="${palette.ink}" stroke-width="2"/><text class="label" x="${x + 24}" y="${y + 49}" style="font-size:${index === 3 ? 25 : 28}px">${escapeXml(label)}</text><text class="small" x="${x + width - 24}" y="${y + 47}" text-anchor="end" style="fill:${index === 3 ? palette.paper : palette.muted}">${escapeXml(amount)}</text></g>`;
  }).join("");
  return `${rows}<path class="soft" d="M125 602 H1075"/><text class="small" x="600" y="635" text-anchor="middle">${language === "zh" ? "每增加一个互补维度，真正的竞争者就更少" : "Each complementary dimension narrows the field"}</text>`;
}

function ledgerTopology(language) {
  const text = language === "zh"
    ? { left: "中心化记账", right: "分布式账本", center: "单一账本", copy: "每个节点各存一份相同的账本", risk: "单点信任", check: "每个新区块都由节点各自验证" }
    : { left: "CENTRAL BOOKKEEPING", right: "DISTRIBUTED LEDGER", center: "One ledger", copy: "Every node keeps a matching copy", risk: "Single point of trust", check: "Nodes check each new block themselves" };
  const spokes = [[170, 210], [90, 350], [170, 500], [430, 210], [510, 350], [430, 500]];
  const leftNodes = spokes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="27" fill="${palette.white}" stroke="${palette.line}" stroke-width="2"/><path class="soft" d="M${x} ${y} L300 350"/>`).join("");
  const peers = [[780, 210], [675, 350], [780, 500], [1010, 210], [1115, 350], [1010, 500]];
  const peerLines = [[0,1],[0,3],[1,2],[1,4],[2,5],[3,4],[4,5]]
    .map(([a,b]) => `<path class="soft" d="M${peers[a][0]} ${peers[a][1]} L${peers[b][0]} ${peers[b][1]}"/>`).join("");
  const peerNodes = peers.map(([x,y], index) => `<g><circle cx="${x}" cy="${y}" r="39" fill="${index === 4 ? palette.accent : palette.white}" stroke="${palette.ink}" stroke-width="2"/><path d="M${x-15} ${y-9} h30 M${x-15} ${y} h30 M${x-15} ${y+9} h22" stroke="${index === 4 ? palette.paper : palette.ink}" stroke-width="3"/></g>`).join("");
  return `<text class="eyebrow" x="300" y="74" text-anchor="middle">${escapeXml(text.left)}</text><text class="eyebrow" x="900" y="74" text-anchor="middle">${escapeXml(text.right)}</text><path class="soft" d="M600 55 V620"/>${leftNodes}<rect x="235" y="285" width="130" height="130" rx="3" fill="${palette.ink}"/><path d="M265 325 h70 M265 345 h70 M265 365 h50" stroke="${palette.paper}" stroke-width="5"/><text class="label" x="300" y="460" text-anchor="middle">${escapeXml(text.center)}</text><text class="small" x="300" y="495" text-anchor="middle">${escapeXml(text.risk)}</text>${peerLines}${peerNodes}<text class="label" x="900" y="600" text-anchor="middle" style="font-size:20px">${escapeXml(text.copy)}</text><text class="small" x="900" y="632" text-anchor="middle">${escapeXml(text.check)}</text>`;
}

function transactionPath(language) {
  const labels = language === "zh"
    ? [["01", "广播交易", "用户签名并发送"], ["02", "进入内存池", "等待矿工选择"], ["03", "写入区块", "手续费影响优先级"], ["04", "获得确认", "后续区块继续累积"]]
    : [["01", "Broadcast", "User signs and sends"], ["02", "Mempool", "Waits for selection"], ["03", "Included in block", "Fee affects priority"], ["04", "Confirmations", "Later blocks add confidence"]];
  const cards = labels.map(([n,label,sub], index) => {
    const x = 55 + index * 290;
    return `<g><rect class="node" x="${x}" y="250" width="245" height="190" rx="3"/><text class="number" x="${x+22}" y="285">${n}</text><text class="label" x="${x+22}" y="334" style="font-size:${language === "en" ? 24 : 28}px">${escapeXml(label)}</text><text class="small" x="${x+22}" y="370">${escapeXml(sub)}</text>${index === 3 ? `<g transform="translate(${x+23} 392)"><rect width="48" height="14" fill="${palette.accent}"/><rect x="58" width="48" height="14" fill="${palette.ink}"/><rect x="116" width="48" height="14" fill="${palette.ink}"/></g>` : ""}</g>`;
  }).join("");
  return `<path class="soft" d="M80 190 H1120"/><text class="eyebrow" x="80" y="165">${language === "zh" ? "一笔交易的路径" : "THE PATH OF A TRANSACTION"}</text>${cards}<path class="accent" d="M300 345 H330" marker-end="url(#arrow-accent)"/><path class="strong" d="M590 345 H620" marker-end="url(#arrow)"/><path class="strong" d="M880 345 H910" marker-end="url(#arrow)"/><text class="small" x="600" y="545" text-anchor="middle">${language === "zh" ? "约 10 分钟一个区块 · 常见服务等待多次确认" : "ABOUT 10 MINUTES PER BLOCK · SERVICES OFTEN WAIT FOR MULTIPLE CONFIRMATIONS"}</text>`;
}

function governanceBalance(language) {
  const text = language === "zh"
    ? { miners: "矿工", minersSub: "打包交易，提供算力", devs: "开发者", devsSub: "提出并维护代码", users: "用户", usersSub: "选择采用或拒绝", core: "共同规则", line: "没有任何一方可以单独决定整个网络" }
    : { miners: "MINERS", minersSub: "Build blocks, supply hashpower", devs: "DEVELOPERS", devsSub: "Propose and maintain code", users: "USERS", usersSub: "Adopt or reject", core: "SHARED RULES", line: "No single group decides for the whole network" };
  const nodes = [[600, 190, text.miners, text.minersSub, -112], [300, 470, text.devs, text.devsSub, 118], [900, 470, text.users, text.usersSub, 118]];
  const size = language === "en" ? 22 : 28;
  const circles = nodes.map(([x, y, label, sub, offset]) => `<g><circle cx="${x}" cy="${y}" r="80" fill="${palette.white}" stroke="${palette.ink}" stroke-width="2"/><text class="label" x="${x}" y="${y + size * 0.36}" text-anchor="middle" style="font-size:${size}px">${escapeXml(label)}</text><text class="small" x="${x}" y="${y + offset}" text-anchor="middle">${escapeXml(sub)}</text></g>`).join("");
  return `<path class="strong" d="M543 254 L360 409" marker-start="url(#arrow)" marker-end="url(#arrow)"/><path class="strong" d="M657 254 L840 409" marker-start="url(#arrow)" marker-end="url(#arrow)"/><path class="accent" d="M390 470 H810" marker-start="url(#arrow-accent)" marker-end="url(#arrow-accent)"/>${circles}<rect x="490" y="330" width="220" height="72" rx="36" fill="${palette.ink}"/><text class="inverse" x="600" y="374" text-anchor="middle" style="font-size:21px;font-weight:700">${escapeXml(text.core)}</text><text class="small" x="600" y="645" text-anchor="middle">${escapeXml(text.line)}</text>`;
}

function studyRoadmap(language) {
  const labels = language === "zh"
    ? [["01", "打基础", "词汇 + 语法"], ["02", "熟悉形式", "机考 + 真题"], ["03", "分项训练", "听 · 说 · 读 · 写"], ["04", "考前冲刺", "限时 + 复盘"]]
    : [["01", "Foundation", "Vocabulary + grammar"], ["02", "Format", "Computer test + papers"], ["03", "Section work", "Listen · speak · read · write"], ["04", "Final stretch", "Timing + review"]];
  const stations = labels.map(([n,label,sub], index) => {
    const x = 150 + index * 300;
    const y = index % 2 === 0 ? 295 : 415;
    return `<g><rect x="${x - 112}" y="${y - 46}" width="224" height="92" rx="3" fill="${index === 3 ? palette.accent : palette.white}" stroke="${palette.ink}" stroke-width="3"/><text class="number" x="${x}" y="${y-66}" text-anchor="middle">${n}</text><text class="label" x="${x}" y="${y+9}" text-anchor="middle" style="font-size:${language === "en" ? 25 : 27}px;fill:${index === 3 ? palette.paper : palette.ink}">${escapeXml(label)}</text><text class="small" x="${x}" y="${y+82}" text-anchor="middle" style="font-size:${language === "en" ? 16 : 17}px">${escapeXml(sub)}</text></g>`;
  }).join("");
  return `<text class="eyebrow" x="70" y="78">${language === "zh" ? "从基础到考场" : "FROM FOUNDATION TO TEST DAY"}</text><path d="M95 295 C255 295 305 415 450 415 S650 295 750 295 S940 415 1050 415" fill="none" stroke="${palette.line}" stroke-width="12" stroke-linecap="round"/><path d="M95 295 C255 295 305 415 450 415 S650 295 750 295 S940 415 1050 415" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow)"/>${stations}`;
}

function readingDiagnosis(language) {
  const text = language === "zh"
    ? { root: "这道题为什么错？", cards: [["题目理解", "重读限定词与语法"], ["文章理解", "回到上下文核对逻辑"], ["词汇不足", "整理同义替换"]], footer: "先诊断，再训练" }
    : { root: "WHY WAS THIS ANSWER WRONG?", cards: [["Question", "Check qualifiers & grammar"], ["Passage", "Reread context & logic"], ["Vocabulary", "Collect the paraphrase"]], footer: "DIAGNOSE FIRST, THEN TRAIN" };
  const cards = text.cards.map(([label, action], index) => {
    const x = 80 + index * 375;
    return `<g><rect class="node" x="${x}" y="350" width="290" height="155" rx="3"/><text class="number" x="${x+25}" y="386">0${index+1}</text><text class="label" x="${x+25}" y="428">${escapeXml(label)}</text><path class="soft" d="M${x+25} 448 H${x+265}"/><text class="small" x="${x+25}" y="480">${escapeXml(action)}</text></g>`;
  }).join("");
  return `<rect x="365" y="90" width="470" height="100" rx="3" fill="${palette.ink}"/><text class="inverse" x="600" y="151" text-anchor="middle" style="font-size:${language === "en" ? 25 : 28}px;font-weight:700">${escapeXml(text.root)}</text><path class="strong" d="M600 190 V270 H225 V335" marker-end="url(#arrow)"/><path class="strong" d="M600 270 V335" marker-end="url(#arrow)"/><path class="strong" d="M600 270 H975 V335" marker-end="url(#arrow)"/>${cards}<path class="accent" d="M420 585 H780" marker-end="url(#arrow-accent)"/><text class="eyebrow" x="600" y="625" text-anchor="middle">${escapeXml(text.footer)}</text>`;
}

function speakingCycle(language) {
  const labels = language === "zh"
    ? [["01", "准备", "选一个真实故事"], ["02", "限时表达", "录下 2 分钟"], ["03", "回听", "找出一个问题"], ["04", "重说", "改完再来一轮"]]
    : [["01", "PREPARE", "Pick a real story"], ["02", "SPEAK", "Record two minutes"], ["03", "REVIEW", "Spot one problem"], ["04", "REPEAT", "Fix it, go again"]];
  const positions = [[600, 126], [930, 335], [600, 544], [270, 335]];
  const nodes = labels.map(([n, label, sub], index) => {
    const [x, y] = positions[index];
    const lit = index === 1;
    return `<g><circle cx="${x}" cy="${y}" r="94" fill="${lit ? palette.accent : palette.white}" stroke="${palette.ink}" stroke-width="2"/><text class="number" x="${x}" y="${y - 32}" text-anchor="middle" style="fill:${lit ? palette.paper : palette.accent}">${n}</text><text class="label" x="${x}" y="${y + 6}" text-anchor="middle" style="font-size:24px;fill:${lit ? palette.paper : palette.ink}">${escapeXml(label)}</text><text class="small" x="${x}" y="${y + 40}" text-anchor="middle" style="font-size:15px;fill:${lit ? palette.paper : palette.muted}">${escapeXml(sub)}</text></g>`;
  }).join("");
  return `<path class="strong" d="M694 156 C800 182 862 220 893 244" marker-end="url(#arrow)"/><path class="strong" d="M896 426 C862 472 790 514 694 524" marker-end="url(#arrow)"/><path class="strong" d="M506 524 C410 514 338 472 304 426" marker-end="url(#arrow)"/><path class="accent" d="M304 244 C338 198 404 164 506 148" marker-end="url(#arrow-accent)"/>${nodes}<circle cx="600" cy="335" r="58" fill="${palette.ink}"/><path d="M588 305 h24 a14 14 0 0 1 14 14 v26 a14 14 0 0 1-14 14 h-24 a14 14 0 0 1-14-14 v-26 a14 14 0 0 1 14-14z M560 336 a40 40 0 0 0 80 0 M600 376 v22 M570 398 h60" fill="none" stroke="${palette.paper}" stroke-width="6" stroke-linecap="round"/>`;
}

const renderers = {
  "investment-feedback-loop": feedbackLoop,
  "scarcity-demand-supply-impact": scarcityModel,
  "scarcity-skill-stack": skillStack,
  "bitcoin-ledger-topology": ledgerTopology,
  "bitcoin-transaction-path": transactionPath,
  "bitcoin-governance-balance": governanceBalance,
  "ielts-study-roadmap": studyRoadmap,
  "ielts-reading-diagnosis": readingDiagnosis,
  "ielts-speaking-cycle": speakingCycle,
};

export function renderSvg(candidate, language) {
  const render = renderers[candidate.imageId];
  if (!render) throw new Error(`No deterministic SVG renderer for ${candidate.imageId}`);
  return shell(candidate, language, render(language));
}
