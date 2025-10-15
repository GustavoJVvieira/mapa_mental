// ====================================================================
// script.js
// ====================================================================
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ===============================
// CONFIGURAÇÃO
// ===============================
const GEMINI_API_KEY = AIzaSyBvqBe5dKexHUXJcHdqAHaYimKBuEN1nKc; // ⚠️ Substitua por sua chave Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ===============================
// LÓGICA DO BOTÃO "GERAR COM GEMINI"
// ===============================
document.getElementById("generateBtn").addEventListener("click", async () => {
  const inputText = document.getElementById("input").value.trim();
  if (!inputText) {
    alert("Insira um texto para gerar o mapa mental.");
    return;
  }

  const prompt = `
Você é um gerador de estrutura de mapa mental. Sua tarefa é analisar o texto abaixo e convertê-lo em uma estrutura hierárquica, seguindo estritamente este formato:

[ideia central:] <Tema Principal>
[box 1.] <Tópico Principal>
subtópico 1 - <Subtópico>
subtópico 1.1 - <Sub-Subtópico>

Texto a ser processado:
---
${inputText}
---

Responda SOMENTE no formato de mapa mental.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    if (!response.startsWith("[ideia central:]")) {
      throw new Error("O formato retornado não parece válido.");
    }

    document.getElementById("input").value = response;
    alert("✅ Mapa mental gerado! Agora clique em 'Parser & Desenhar'.");
  } catch (error) {
    console.error("Erro com Gemini:", error);
    alert("Erro ao gerar com Gemini. Veja o console para detalhes.");
  }
});

let renderedMapData = { central: null, children: [] };
const AVAILABLE_COLORS = {
    'verde': '#5cb85c', 'roxo': '#9c58b6', 'azul': '#4c87c6',
    'amarelo': '#e6c243', 'cinza': '#4c4c4c', 'branco': '#f0f0f0',
    'vermelho': '#cc4c4c',
    
    // NOVAS CORES (Vibrantes adicionadas)
    'ciano': '#00bfa5',
    'magenta': '#d44c9d',
    'laranja': '#ff9900',
    'verde-claro': '#99cc66',
    'marrom': '#8d5524',
    'vermelho-puro': '#e44c4c',
    'azul-escuro': '#1e5f9b'
};

// Array de cores para facilitar a iteração na paleta
const COLOR_PALETTE = Object.entries(AVAILABLE_COLORS).map(([name, hex]) => ({ name, hex }));

let editingNodeElement = null;
// Variáveis de Pan/Zoom
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let startPanX = 0;
let startPanY = 0;
// Elementos DOM (serão inicializados no 'load')
let stage;
let svg;
let colorPaletteContainer; // Novo elemento

// --- Funções de Utilidade de String ---
// Converte \n (do modal ou do parser) para <br>
function nl2br(str) {
    return str.replace(/\n/g, '<br>');
}
function escapeHtml(s){
    const temp = document.createElement('div');
    temp.textContent = s;
    let escaped = temp.innerHTML;
   
    // Desescapa os <br> gerados por nl2br
    return escaped.replace(/&lt;br&gt;/g, '<br>');
}
// --- Funções de Modal ---
function openModal(nodeEl) {
    editingNodeElement = nodeEl;
   
    let currentTitle;
    if (nodeEl.classList.contains('node')) {
        // Nó principal usa innerText
        currentTitle = nodeEl.querySelector('.title')?.innerText || '';
    } else {
        // Subtópicos e sub-subtópicos usam innerHTML, trocamos <br> por \n para o editor
        currentTitle = nodeEl.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    }
   
    document.getElementById('editTitle').value = currentTitle;
   
    let currentColor = nodeEl.style.backgroundColor || getComputedStyle(nodeEl).backgroundColor;
    document.getElementById('editColor').value = currentColor;

    // Controla a visibilidade dos campos de cor (apenas para 'node' principal)
    const colorFields = document.getElementById('colorEditFields');
    if (nodeEl.classList.contains('node')) {
        colorFields.style.display = 'block';
        updateColorPaletteDisplay(currentColor); // Atualiza seleção na paleta
    } else {
        colorFields.style.display = 'none';
    }

    document.getElementById('editModal').style.display = 'flex';
}

function updateColorPaletteDisplay(currentColor) {
    if (!colorPaletteContainer) return;

    colorPaletteContainer.querySelectorAll('.color-square').forEach(square => {
        square.classList.remove('selected');
        // Usa o valor em hexadecimal puro para a comparação, ignorando a cor de fundo RGB computada
        const squareHex = square.getAttribute('data-hex').toLowerCase();
        // Simplificação: compara com o valor hex guardado no data-hex
        if (currentColor && (currentColor.toLowerCase() === squareHex || currentColor.toLowerCase().includes(squareHex.substring(1)))) {
             square.classList.add('selected');
        } else if (currentColor && currentColor.startsWith('#') && currentColor.toLowerCase() === squareHex) {
             square.classList.add('selected');
        }
    });
}


// Nova função para a seleção da cor pela paleta
window.selectColorFromPalette = function(squareEl) {
    const hex = squareEl.getAttribute('data-hex');
    const name = squareEl.getAttribute('data-name');
    document.getElementById('editColor').value = hex; // Preenche o campo de texto
    updateColorPaletteDisplay(hex); // Atualiza a seleção visual
}


// CORREÇÃO: Expondo as funções de Modal para o escopo global (window)
window.closeModal = function() {
    document.getElementById('editModal').style.display = 'none';
    editingNodeElement = null;
}
window.saveNodeChanges = function() {
    if (!editingNodeElement) return;
    const n = editingNodeElement;
    const newTitle = document.getElementById('editTitle').value.trim();
    // Pega o valor do campo de cor, que pode ter sido preenchido manualmente ou pela paleta
    const newColorInput = document.getElementById('editColor').value.trim(); 
   
    if (newTitle) {
        if (n.classList.contains('node')) {
            // Nó principal: usa innerText
            n.querySelector('.title').innerText = newTitle;
        } else {
            // Subtópicos: usa nl2br e innerHTML
            n.innerHTML = nl2br(newTitle);
        }
    }
   
    if (newColorInput && n.classList.contains('node')) {
        // Tenta usar o valor exato (Hex ou nome)
        let finalColor = newColorInput.startsWith('#') ? newColorInput : AVAILABLE_COLORS[newColorInput.toLowerCase()];
        
        // Se a cor final for válida, aplica
        if (finalColor) {
            // Limpa a classe de cor antiga (box-color-X)
            n.className = n.className.replace(/box-color-\d+/g, '').trim(); 
            n.style.backgroundColor = finalColor;
            n.style.borderColor = finalColor;
            
            // Lógica para determinar a cor do texto (claro ou escuro)
            const isLightColor = finalColor.toLowerCase() === '#f0f0f0' || finalColor.toLowerCase() === AVAILABLE_COLORS['branco'] || finalColor.toLowerCase() === 'rgb(240, 240, 240)';
            n.style.color = isLightColor ? 'var(--box5-text)' : 'var(--box-text)';
            n.querySelector('.title').style.color = isLightColor ? 'var(--box5-text)' : 'var(--box-text)';
        }
    }
    closeModal();
    updateSVGLines();
}

// Nova função para criar e renderizar a paleta de cores
function createColorPalette() {
    colorPaletteContainer = document.getElementById('colorPalette');
    if (!colorPaletteContainer) return;
    
    COLOR_PALETTE.forEach(color => {
        const square = document.createElement('div');
        square.className = 'color-square';
        square.style.backgroundColor = color.hex;
        square.title = color.name;
        square.setAttribute('data-hex', color.hex);
        square.setAttribute('data-name', color.name);
        square.onclick = () => selectColorFromPalette(square);
        colorPaletteContainer.appendChild(square);
    });
}


// --- Parser ---
function parseInput(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l!="");
  const docs = [];
  let current = null;
  let currentBox = null;
  let currentSubtopic = null;
  let lastSubtopicIndex = 0;
 
  const BREAK_CHAR = '|';
 
  for(let i=0;i<lines.length;i++){
    const raw = lines[i];
   
    if(/\[\s*ideia central\s*:?\s*\]/i.test(raw)){
      const after = raw.replace(/\[.*?\]/,'').trim();
      if(current) docs.push(current);
      current = {title: after || 'Sem título', boxes: []};
      currentBox = null; currentSubtopic = null; lastSubtopicIndex = 0;
      continue;
    }
   
    const boxMatch = raw.match(/^(?:\[?\s*box\s*\d+\.?\]?\s*[:\-]?\s*)(.*)$/i);
    if(boxMatch){
      const title = boxMatch[1].trim() || 'Sem título de box';
      current = current || {title:'Sem ideia central', boxes:[]};
      currentBox = {title:title, subtópicos:[]};
      current.boxes.push(currentBox);
      currentSubtopic = null; lastSubtopicIndex = 0;
      continue;
    }
   
    const subtopicMatch = raw.match(/^(?:subt[oó]pico|subtopico)\s*(\d+)(?:\.(\d+))?\s*[:\-]?\s*(.*)$/i);
   
    if(subtopicMatch){
        const fullIndex = subtopicMatch[1];
        const subIndex = subtopicMatch[2];
        let title = subtopicMatch[3].trim().replace(/;$/, '');
       
        // CONVERSÃO PRINCIPAL: Substitui o pipe (|) por \n
        title = title.replace(new RegExp('\\' + BREAK_CHAR, 'g'), '\n');
        currentBox = currentBox || (current.boxes.length > 0 ? current.boxes[current.boxes.length-1] : (current.boxes.push({title:'Sem box', subtópicos:[]}) && current.boxes[0]));
       
        if (subIndex) {
            const parentIndex = parseInt(fullIndex);
            if (parentIndex !== lastSubtopicIndex) {
                 const parentTopic = currentBox.subtópicos.find(t => t.id === parentIndex);
                 currentSubtopic = parentTopic || currentSubtopic;
                 lastSubtopicIndex = parentIndex;
            }
            if(currentSubtopic) {
                currentSubtopic.subsubtópicos.push(title);
            }
        } else {
            const topicIndex = parseInt(fullIndex);
            currentSubtopic = {title: title, id: topicIndex, subsubtópicos: []};
            currentBox.subtópicos.push(currentSubtopic);
            lastSubtopicIndex = topicIndex;
        }
        continue;
    }
  }
  if(current) docs.push(current);
  return docs;
}
// --- Funções de NÓ e Desenho ---
function clearStage(){
  stage.innerHTML='';
  svg.innerHTML='';
  renderedMapData = { central: null, children: [] };
}
function draw(doc){
  if (doc.boxes.length === 0) return;
  clearStage();
  const w = stage.clientWidth; const h = stage.clientHeight;
  const cx = w/2; const cy = h/2;
 
  const central = createNode(doc.title, true);
  central.style.left = (cx - 100) + 'px';
  central.style.top = (cy - 30) + 'px';
  stage.appendChild(central);
  renderedMapData.central = { el: central, children: [] };
  const initialPositions = [
      {x: cx - 250, y: cy - 30}, // Box 1
      {x: cx + 150, y: cy - 30}, // Box 2
      {x: cx - 250, y: cy + 100}, // Box 3
      {x: cx + 150, y: cy + 100}, // Box 4
      {x: cx + 50, y: cy - 150} // Box 5
  ];
  for(let i=0;i<doc.boxes.length;i++){
    const b = doc.boxes[i];
    const pos = initialPositions[i] || {x: cx + Math.cos(i * Math.PI * 2 / doc.boxes.length) * 200, y: cy + Math.sin(i * Math.PI * 2 / doc.boxes.length) * 200};
   
    const childNode = createNode(b.title, false, i + 1);
    childNode.style.left = (pos.x - 100) + 'px';
    childNode.style.top = (pos.y - 30) + 'px';
    stage.appendChild(childNode);
   
    const childData = { el: childNode, subtópicos: [] };
    b.subtópicos.forEach((sub, j) => {
        const subEl = createSubNode(sub.title, j);
        stage.appendChild(subEl);
       
        const subData = { el: subEl, subsubtópicos: [] };
        sub.subsubtópicos.forEach((subsub, k) => {
            const subSubEl = createSubSubNode(subsub, k);
            stage.appendChild(subSubEl);
            subData.subsubtópicos.push({ el: subSubEl, title: subsub });
        });
       
        childData.subtópicos.push(subData);
    });
    renderedMapData.central.children.push(childData);
  }
 
  const allSubNodes = renderedMapData.central.children.flatMap(c =>
      c.subtópicos.flatMap(s => [s.el].concat(s.subsubtópicos.map(ss => ss.el)))
  );
  const allMainNodes = renderedMapData.central.children.map(c => c.el);
 
  makeDraggableGroup(central, allMainNodes.concat(allSubNodes));
 
  allMainNodes.forEach(mainNode => {
      const parentData = renderedMapData.central.children.find(c => c.el === mainNode);
      if (!parentData) return;
     
      parentData.subtópicos.forEach(subData => {
          const subSubElements = subData.subsubtópicos.map(ss => ss.el);
          makeDraggableGroup(subData.el, subSubElements, true);
      });
      const allChildren = parentData.subtópicos.flatMap(s => [s.el].concat(s.subsubtópicos.map(ss => ss.el)));
      makeDraggableGroup(mainNode, allChildren, true);
  });
 
  updateSVGLines();
}
// Criação dos Nodes
function createNode(title, central=false, boxIndex = 0){
  const n = document.createElement('div');
  n.className = 'node ' + (central ? 'central' : 'child');
  if(!central && boxIndex > 0) { n.classList.add(`box-color-${boxIndex}`); }
  n.innerHTML = `<div class="title">${escapeHtml(title)}</div>`;
  n.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(n); });
  return n;
}
function createSubNode(title, index) {
    const n = document.createElement('div');
    n.className = 'sub-node';
    n.innerHTML = nl2br(escapeHtml(title));
    n.setAttribute('data-index', index);
    n._hasBeenDragged = false;
    makeDraggable(n);
    return n;
}
function createSubSubNode(title, index) {
    const n = document.createElement('div');
    n.className = 'sub-sub-node';
    n.innerHTML = nl2br(escapeHtml(title));
    n.setAttribute('data-index', index);
    n._hasBeenDragged = false;
    makeDraggable(n);
    return n;
}
// Funções de Arrasto
function makeDraggable(el){
  let dragging=false, startX=0, startY=0, origX=0, origY=0;
  el.addEventListener('pointerdown', (ev)=>{
    el.setPointerCapture(ev.pointerId);
    dragging=true; startX=ev.clientX; startY=ev.clientY;
    origX = parseFloat(el.style.left)||0; origY = parseFloat(el.style.top)||0;
    el.style.cursor='grabbing'; el._isDragging = true;
    el._hasBeenDragged = true;
  });
  window.addEventListener('pointermove', (ev)=>{
    if(!dragging) return;
    const dx = (ev.clientX - startX)/zoom; const dy = (ev.clientY - startY)/zoom;
    el.style.left = (origX + dx) + 'px'; el.style.top = (origY + dy) + 'px';
    updateSVGLines();
  });
  window.addEventListener('pointerup', (ev)=>{
    dragging=false; el.style.cursor='grab'; el._isDragging = false;
  });
}
function makeDraggableGroup(mainEl, groupEls = [], isNested = false){
  let dragging=false, startX=0, startY=0, origX=0, origY=0;
 
  mainEl.addEventListener('pointerdown', (ev)=>{
    if (ev.target.closest('.sub-node') && !isNested) return;
    if (ev.target.closest('.sub-sub-node') && !isNested) return;
    mainEl.setPointerCapture(ev.pointerId);
    dragging=true; startX=ev.clientX; startY=ev.clientY;
    origX = parseFloat(mainEl.style.left)||0; origY = parseFloat(mainEl.style.top)||0;
    mainEl.style.cursor='grabbing';
   
    groupEls.forEach(el => {
        el._origX = parseFloat(el.style.left)||0;
        el._origY = parseFloat(el.style.top)||0;
    });
    if (isNested && mainEl.classList.contains('child')) {
       const centralEl = renderedMapData.central.el;
       if (centralEl && centralEl._isDragging) {
           dragging = false;
           mainEl.style.cursor='grab';
           return;
       }
    }
    mainEl._isDragging = true;
  });
 
  window.addEventListener('pointermove', (ev)=>{
    if(!dragging) return;
    const dx = (ev.clientX - startX)/zoom;
    const dy = (ev.clientY - startY)/zoom;
   
    mainEl.style.left = (origX + dx) + 'px';
    mainEl.style.top = (origY + dy) + 'px';
   
    groupEls.forEach(el => {
        el.style.left = (el._origX + dx) + 'px';
        el.style.top = (el._origY + dy) + 'px';
    });
   
    updateSVGLines();
  });
 
  window.addEventListener('pointerup', (ev)=>{
    dragging=false;
    mainEl.style.cursor='grab';
    mainEl._isDragging = false;
  });
}
// ATUALIZAÇÃO DE LINHAS E POSICIONAMENTO FINAL
function updateSVGLines() {
    if (!renderedMapData.central) return;
    svg.innerHTML = '';

    const getElementMetrics = (el) => {
        const x_orig = parseFloat(el.style.left) || 0;
        const y_orig = parseFloat(el.style.top) || 0;
        const rect = el.getBoundingClientRect();
        const w = rect.width / zoom;
        const h = rect.height / zoom;
        return { x: x_orig, y: y_orig, w: w, h: h, cx: x_orig + w / 2, cy: y_orig + h / 2 };
    };

    const SUB_VERTICAL_OFFSET = 20;
    const SUB_SPACING_Y = 22;
    const LINE_TO_TEXT_OFFSET = 5;
    const HORIZONTAL_INDENT = 20;
    const transformX = (x) => x * zoom + panX;
    const transformY = (y) => y * zoom + panY;
    const centralMetrics = getElementMetrics(renderedMapData.central.el);

    renderedMapData.central.children.forEach(childData => {
        const mainMetrics = getElementMetrics(childData.el);

        // ====================================================================
        // 1. CONEXÃO NÓ CENTRAL -> NÓ FILHO (BOX) - Conexão Lateral Obrigatória com Curva
        // ====================================================================
        let x1_raw = centralMetrics.cx;
        let y1_raw = centralMetrics.cy;
        let x2_raw, y2_raw;
        
        // Determina qual lado do nó filho (box) é mais próximo para conexão
        const isChildLeft = mainMetrics.cx < centralMetrics.cx;

        if (isChildLeft) {
            // Conexão na lateral direita do nó filho
            x2_raw = mainMetrics.x + mainMetrics.w;
            y2_raw = mainMetrics.cy;
        } else {
            // Conexão na lateral esquerda do nó filho
            x2_raw = mainMetrics.x;
            y2_raw = mainMetrics.cy;
        }

        const x1 = transformX(x1_raw);
        const y1 = transformY(y1_raw);
        const x2 = transformX(x2_raw);
        const y2 = transformY(y2_raw);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx_raw = x2_raw - x1_raw;
        const dy_raw = y2_raw - y1_raw;

        // Curva suave, priorizando a horizontalidade
        let cp1x, cp1y, cp2x, cp2y;
        
        cp1x = x1 + dx_raw * 0.5;
        cp1y = y1; 
        cp2x = x2 - dx_raw * 0.5;
        cp2y = y2;

        line.setAttribute('d', `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`);
        svg.appendChild(line);

        // ====================================================================
        // 2. CONEXÃO NÓ FILHO (BOX) -> SUBTÓPICO - L-Shape (Ortogonal)
        // ====================================================================
        
        let currentSubY = mainMetrics.y + mainMetrics.h + SUB_VERTICAL_OFFSET; 
        
        childData.subtópicos.forEach((subData, index) => {
            const subEl = subData.el;
            
            // 2.1. Posicionamento Automático dos Subtópicos (se não arrastados)
            if (!subEl._isDragging && !subEl._hasBeenDragged) {
                // Posição em cascata abaixo do nó pai, com recuo
                const subXPos = mainMetrics.x + LINE_TO_TEXT_OFFSET * 4;
                const subYPos = currentSubY;
                
                subEl.style.left = subXPos + 'px';
                subEl.style.top = subYPos + 'px';
            }
            
            // Recalcula métricas após potencial reposicionamento
            const newSubMetrics = getElementMetrics(subEl);
            
            // 2.2. Cálculo da Linha BOX -> SUBTÓPICO (L-Shape)
            const lineN2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineN2.classList.add('sub-line');
            
            // PONTO DE PARTIDA (Box Lateral Esquerda)
            const t_startX_N1 = transformX(mainMetrics.x); 
            const t_startY_N1 = transformY(mainMetrics.cy); 
            
            // PONTO FINAL (Subtópico Lateral Esquerda)
            const t_endX_N2 = transformX(newSubMetrics.x);
            const t_endY_N2 = transformY(newSubMetrics.cy);
            
            // PONTO INTERMEDIÁRIO (Horizontal) - Um pequeno desvio à esquerda antes de descer
            const midX_N2 = newSubMetrics.x - HORIZONTAL_INDENT;
            const t_p1x_N2 = transformX(midX_N2);
            const t_p1y_N2 = t_startY_N1; 

            // PONTO INTERMEDIÁRIO (Vertical) - Desce/sobe até a altura do subtópico
            const t_p2x_N2 = t_p1x_N2;
            const t_p2y_N2 = t_endY_N2;
            
            // Path: M (Box Lateral) L (MidX, Box Y) L (MidX, Sub Y) L (Sub Lateral)
            const pathD_N2 = `M ${t_startX_N1} ${t_startY_N1} L ${t_p1x_N2} ${t_p1y_N2} L ${t_p2x_N2} ${t_p2y_N2} L ${t_endX_N2} ${t_endY_N2}`;

            lineN2.setAttribute('d', pathD_N2);
            svg.appendChild(lineN2);


            // 2.3. Cálculo da Linha SUBTÓPICO -> SUB-SUBTÓPICO (L-Shape)
            let currentSubSubY = newSubMetrics.y + newSubMetrics.h + 5;
            subData.subsubtópicos.forEach((subSubData, k) => {
                const subSubEl = subSubData.el;
                
                // Posicionamento Automático dos Sub-Subtópicos (se não arrastados)
                if (!subSubEl._isDragging && !subSubEl._hasBeenDragged) {
                    const subSubXPos = newSubMetrics.x + HORIZONTAL_INDENT;
                    const subSubYPos = currentSubSubY;
                    subSubEl.style.left = subSubXPos + 'px';
                    subSubEl.style.top = subSubYPos + 'px';
                }
                
                // Recalcula métricas após potencial reposicionamento
                const finalSubSubMetrics = getElementMetrics(subSubEl);

                const subSubLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                subSubLine.classList.add('sub-sub-line');
                
                // PONTO DE PARTIDA (Subtópico Lateral Esquerda)
                const t_startX_N2 = transformX(newSubMetrics.x); 
                const t_startY_N2 = transformY(newSubMetrics.cy); 
                
                // PONTO FINAL (Sub-Subtópico Lateral Esquerda)
                const t_endX_N3 = transformX(finalSubSubMetrics.x);
                const t_endY_N3 = transformY(finalSubSubMetrics.cy);
                
                // PONTO INTERMEDIÁRIO (Horizontal) - Recuo para o alinhamento
                const subSubMidX = finalSubSubMetrics.x - LINE_TO_TEXT_OFFSET;
                const t_p1x_N3 = transformX(subSubMidX);
                const t_p1y_N3 = t_startY_N2; // Alinhado verticalmente com o Subtópico

                // PONTO INTERMEDIÁRIO (Vertical)
                const t_p2x_N3 = t_p1x_N3;
                const t_p2y_N3 = t_endY_N3;

                // Path: M (Sub Lateral) L (SubSub MidX, Sub Y) L (SubSub MidX, SubSub Y) L (SubSub Lateral)
                const pathD_N3 = `M ${t_startX_N2} ${t_startY_N2} L ${t_p1x_N3} ${t_p1y_N3} L ${t_p2x_N3} ${t_p2y_N3} L ${t_endX_N3} ${t_endY_N3}`;
                
                subSubLine.setAttribute('d', pathD_N3);
                svg.appendChild(subSubLine);
                
                currentSubSubY += finalSubSubMetrics.h + 5;
            });
           
            currentSubY = Math.max(currentSubY, currentSubSubY) + SUB_SPACING_Y;
        });
    });
}
// --- Funções de Pan/Zoom ---
function applyTransform(){
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  svg.style.transform = `translate(0, 0)`;
  updateSVGLines();
}
// --- Função de Download ---
function downloadMindMap() {
    html2canvas(stage, {
        scale: 2, // Increase resolution for better quality
        useCORS: true,
        backgroundColor: null // Preserve transparency if needed
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'mind_map.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

// Nova função para a geração via API
async function generateMapFromGemini() {
    const rawText = document.getElementById('input').value;
    const generateBtn = document.getElementById('generateBtn');
    
    if (!rawText.trim()) {
        alert('Por favor, insira o texto a ser analisado no campo de entrada.');
        return;
    }

    // Feedback visual
    const originalText = generateBtn.innerText;
    generateBtn.innerText = 'Gerando...';
    generateBtn.disabled = true;
    
    const BACKEND_URL = 'http://localhost:3000/generate-map'; // URL do seu backend

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: rawText }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
        }

        const data = await response.json();
        const generatedMapText = data.generatedMapText;

        // Coloca o texto gerado de volta no textarea e desenha
        document.getElementById('input').value = generatedMapText;
        
        const docs = parseInput(generatedMapText);
        if(docs.length > 0) {
            draw(docs[0]);
        } else {
            alert('A API gerou um texto inválido. Verifique o console.');
        }

    } catch (error) {
        console.error("Erro na geração:", error);
        alert(`Erro ao gerar mapa: ${error.message}`);
    } finally {
        generateBtn.innerText = originalText;
        generateBtn.disabled = false;
    }
}

// --- Event Listeners e Inicialização ---
window.addEventListener('load', ()=>{
  // Inicialização dos elementos DOM
  stage = document.getElementById('stage');
  svg = document.getElementById('svg');
  createColorPalette(); // Inicializa a paleta de cores
  const txt = document.getElementById('input').value;
  const docs = parseInput(txt);
  if(docs.length > 0) draw(docs[0]);
  resize();
  document.getElementById('zoomLevel').innerText='100%';
  // Pan/Zoom setup
  const viewport = document.querySelector('.viewport');
 
  // Evento de Zoom
  viewport.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const oldZoom = zoom;
    const delta = -e.deltaY*0.001;
    zoom = Math.min(2.5, Math.max(0.4, zoom*(1+delta)));
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleChange = zoom/oldZoom;
    panX = mx - scaleChange*(mx - panX);
    panY = my - scaleChange*(my - panY);
    applyTransform();
    document.getElementById('zoomLevel').innerText = Math.round(zoom*100)+'%';
  }, {passive:false});
 
  viewport.addEventListener('contextmenu', (e)=>e.preventDefault());
 
  // Eventos de Pan (Arrastar com Botão Direito)
  viewport.addEventListener('pointerdown', (e)=>{
    if(e.button!==2) return; isPanning=true; panStartX=e.clientX; panStartY=e.clientY; startPanX=panX; startPanY=panY;
  });
  window.addEventListener('pointermove', (ev)=>{
    if(!isPanning) return;
    panX = startPanX + (ev.clientX - panStartX);
    panY = startPanY + (ev.clientY - panStartY);
    applyTransform();
  });
  window.addEventListener('pointerup', (e)=>{ isPanning=false; });
  function resize(){
    svg.setAttribute('width', stage.clientWidth);
    svg.setAttribute('height', stage.clientHeight);
    svg.style.width='100%';
    svg.style.height='100%';
    updateSVGLines();
  }
  new ResizeObserver(resize).observe(stage);
 
  // Botões de controle
  document.getElementById('parseBtn').addEventListener('click', ()=>{
    const txt = document.getElementById('input').value;
    const docs = parseInput(txt);
    if(docs.length===0){ alert('Não encontrei nada para desenhar'); return; }
    draw(docs[0]);
  });
  document.getElementById('clearBtn').addEventListener('click', clearStage);
  
  // Event Listener para o botão de Geração
  document.getElementById('generateBtn').addEventListener('click', generateMapFromGemini); 
  
  document.getElementById('downloadBtn').addEventListener('click', downloadMindMap);
});
// Fim do script.js
