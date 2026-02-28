import Papa from 'papaparse';
import JSZip from 'jszip';
import './style.css';

function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const FONT_LIST = [
  'Inter', 'Roboto', 'Montserrat', 'Poppins', 'Raleway', 'Oswald',
  'Open Sans', 'Quicksand', 'Nunito',
  'Playfair Display', 'Lora', 'Merriweather', 'Libre Baskerville',
  'Cormorant Garamond', 'Cinzel', 'Crimson Text', 'Source Serif 4', 'EB Garamond',
  'Great Vibes', 'Dancing Script'
];

// Ensure all fonts are loaded for canvas by rendering hidden text
function preloadFontsForCanvas() {
  const testDiv = document.createElement('div');
  testDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
  document.body.appendChild(testDiv);

  FONT_LIST.forEach(font => {
    const span = document.createElement('span');
    span.style.fontFamily = `"${font}", sans-serif`;
    span.style.fontSize = '48px';
    span.textContent = 'AaBbCcÇçĞğİıÖöŞşÜü1234567890';
    // Test all weights
    [300, 400, 500, 600, 700].forEach(w => {
      const s = span.cloneNode(true);
      s.style.fontWeight = w;
      testDiv.appendChild(s);
    });
  });

  // Use document.fonts.ready to ensure all fonts are loaded
  document.fonts.ready.then(() => {
    document.body.removeChild(testDiv);
  });
}

preloadFontsForCanvas();

/*   STATE               */
const state = {
  // Image
  certificateImage: null,
  imageFileName: '',

  // CSV
  csvData: [],
  csvHeaders: [],
  selectedColumns: [],

  // Text box (relative 0-1 coordinates)
  boxX: 0.2,        // left edge of box
  boxY: 0.45,       // top edge of box
  boxW: 0.6,        // width as fraction of image
  boxH: 0.1,        // height as fraction of image
  positionSet: false,

  // Canvas zoom
  zoom: 1.0,

  // Text settings
  fontFamily: 'Inter',
  fontSize: 60,
  fontWeight: '700',
  fontColor: '#1a1a2e',
  textAlign: 'center',
  textTransform: 'none',
  prefix: '',

  // Output
  outputFormat: 'png',

  // Overflow detection
  overflowNames: [],
};

/*   DOM ELEMENTS        */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Upload
const imageDropzone = $('#image-dropzone');
const imageInput = $('#image-input');
const imagePreviewContainer = $('#image-preview-container');
const imagePreviewThumb = $('#image-preview-thumb');
const removeImageBtn = $('#remove-image');

const csvDropzone = $('#csv-dropzone');
const csvInput = $('#csv-input');
const csvPreviewContainer = $('#csv-preview-container');
const csvFilename = $('#csv-filename');
const csvCount = $('#csv-count');
const removeCsvBtn = $('#remove-csv');

// Tabs
const tabBtn1 = $('#tab-btn-1');
const tabBtn2 = $('#tab-btn-2');
const tabBtn3 = $('#tab-btn-3');
const tabBtn4 = $('#tab-btn-4');
const tabPanels = {
  upload:    $('#tab-upload'),
  columns:   $('#tab-columns'),
  settings:  $('#tab-settings'),
  generate:  $('#tab-generate'),
};

// Tab switching
function showTab(name) {
  // Deactivate all
  [tabBtn1, tabBtn2, tabBtn3, tabBtn4].forEach(b => {
    b.setAttribute('aria-selected', 'false');
  });
  Object.values(tabPanels).forEach(p => { if (p) p.hidden = true; });

  // Activate chosen
  const panelMap = { upload: tabBtn1, columns: tabBtn2, settings: tabBtn3, generate: tabBtn4 };
  const btn = panelMap[name];
  if (btn) btn.setAttribute('aria-selected', 'true');
  if (tabPanels[name]) tabPanels[name].hidden = false;
}

// Wire tab buttons
tabBtn1.addEventListener('click', () => showTab('upload'));
tabBtn2.addEventListener('click', () => { if (!tabBtn2.disabled) showTab('columns'); });
tabBtn3.addEventListener('click', () => { if (!tabBtn3.disabled) showTab('settings'); });
tabBtn4.addEventListener('click', () => { if (!tabBtn4.disabled) showTab('generate'); });

// Columns
const columnCheckboxes = $('#column-checkboxes');
const namePreviewList = $('#name-preview-list');

// Canvas
const canvasContainer = $('#canvas-container');
const canvas = $('#preview-canvas');
const ctx = canvas.getContext('2d');
const textBoxOverlay = $('#text-box-overlay');

// Controls
const fontFamilySelect = $('#font-family');
const fontSizeSlider = $('#font-size');
const fontSizeValue = $('#font-size-value');
const fontWeightSelect = $('#font-weight');
const fontColorInput = $('#font-color');
const fontColorHex = $('#font-color-hex');
const alignButtons = $$('.align-btn');
const textTransformSelect = $('#text-transform');
const prefixInput = $('#prefix-text');

// Box size sliders
const boxWidthSlider = $('#box-width');
const boxWidthValue = $('#box-width-value');
const boxHeightSlider = $('#box-height');
const boxHeightValue = $('#box-height-value');

// Centering
const btnCenterH = $('#btn-center-h');
const btnCenterV = $('#btn-center-v');

// Zoom
const btnZoomIn = $('#btn-zoom-in');
const btnZoomOut = $('#btn-zoom-out');
const btnZoomReset = $('#btn-zoom-reset');
const btnZoomValueBtn = $('#zoom-value-btn');
const zoomValueEl = $('#zoom-value');
const canvasViewport = $('#canvas-viewport');
const canvasInner = $('#canvas-inner');

// Nudge
const nudgeUp = $('#nudge-up');
const nudgeDown = $('#nudge-down');
const nudgeLeft = $('#nudge-left');
const nudgeRight = $('#nudge-right');
const nudgeCenter = $('#nudge-center');

// Font size step buttons
const btnFontIncrease = $('#btn-font-increase');
const btnFontDecrease = $('#btn-font-decrease');

// Generate
const totalCount = $('#total-count');
const outputFormatSelect = $('#output-format');
const btnGenerate = $('#btn-generate');
const progressSection = $('#progress-section');
const progressBar = $('#progress-bar');
const progressText = $('#progress-text');

// Tab navigation extra buttons
const btnColumnsNext  = $('#btn-columns-next');
const btnUploadNext   = $('#btn-upload-next');
const btnSettingsNext = $('#btn-settings-next');

// Overflow modal
const overflowWarning  = $('#overflow-warning');
const overflowCountEl  = $('#overflow-count');
const btnOverflowDetails = $('#btn-overflow-details');
const btnOverflowDismiss = $('#btn-overflow-dismiss');
const overflowModal    = $('#overflow-modal');
const overflowList     = $('#overflow-list');
const btnModalClose    = $('#btn-modal-close');
const btnModalOk       = $('#btn-modal-ok');

// (overflow refs already declared above)


/*   IMAGE UPLOAD        */
function setupDropzone(dropzone, input, handler) {
  dropzone.addEventListener('click', () => input.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handler(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handler(input.files[0]);
  });
}

function handleImageUpload(file) {
  if (!file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.certificateImage = img;
      state.imageFileName = file.name;

      imagePreviewThumb.src = e.target.result;
      imagePreviewContainer.style.display = 'flex';
      imageDropzone.style.display = 'none';

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Set canvas-inner width proportional to the viewport width for a good default view
      if (canvasInner) {
        const vpW = canvasViewport ? canvasViewport.clientWidth - 48 : 900;
        canvasInner.style.width = Math.min(900, vpW) + 'px';
      }

      drawPreview();

      checkStepVisibility();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

removeImageBtn.addEventListener('click', () => {
  state.certificateImage = null;
  state.positionSet = false;
  imagePreviewContainer.style.display = 'none';
  imageDropzone.style.display = 'flex';
  imageInput.value = '';
  textBoxOverlay.style.display = 'none';
  checkStepVisibility();
});


/*   CSV UPLOAD          */
function handleCsvUpload(file) {
  if (!file.name.endsWith('.csv')) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8',
    complete: (results) => {
      state.csvData = results.data;
      state.csvHeaders = results.meta.fields || [];

      csvFilename.textContent = file.name;
      csvCount.textContent = `${state.csvData.length} satır`;
      csvPreviewContainer.style.display = 'flex';
      csvDropzone.style.display = 'none';

      buildColumnSelectors();
      checkStepVisibility();
    },
    error: (err) => {
      console.error('CSV parse error:', err);
    }
  });
}

removeCsvBtn.addEventListener('click', () => {
  state.csvData = [];
  state.csvHeaders = [];
  state.selectedColumns = [];
  csvPreviewContainer.style.display = 'none';
  csvDropzone.style.display = 'flex';
  csvInput.value = '';
  checkStepVisibility();
});


/*   COLUMN SELECTION    */
function buildColumnSelectors() {
  columnCheckboxes.innerHTML = '';
  state.selectedColumns = [];

  state.csvHeaders.forEach((header) => {
    const label = document.createElement('label');
    label.className = 'column-check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = header;

    const lh = header.toLowerCase();
    if (lh.includes('isim') || lh.includes('name') || lh.includes('soyisim') || lh.includes('surname')) {
      cb.checked = true;
      state.selectedColumns.push(header);
      label.classList.add('selected');
    }

    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.selectedColumns.push(header);
        label.classList.add('selected');
      } else {
        state.selectedColumns = state.selectedColumns.filter(c => c !== header);
        label.classList.remove('selected');
      }
      updateNamePreview();
      drawPreview();
      checkOverflow();
      checkStepVisibility();
    });

    label.appendChild(cb);
    label.appendChild(document.createTextNode(header));
    columnCheckboxes.appendChild(label);
  });

  updateNamePreview();
}

function getNameForRow(row) {
  const parts = state.selectedColumns.map(col => (row[col] || '').trim()).filter(Boolean);
  let name = parts.join(' ');

  if (state.textTransform === 'uppercase') {
    name = name.toLocaleUpperCase('tr');
  } else if (state.textTransform === 'capitalize') {
    name = name.replace(/\b\w/g, (c) => c.toLocaleUpperCase('tr'));
  }

  if (state.prefix) {
    name = state.prefix + name;
  }

  return name;
}

function getAllNames() {
  return state.csvData
    .map(row => getNameForRow(row))
    .filter(name => name.length > 0);
}

function updateNamePreview() {
  namePreviewList.innerHTML = '';
  const names = getAllNames().slice(0, 5);

  names.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    namePreviewList.appendChild(li);
  });

  if (names.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sütun seçin...';
    li.style.color = 'var(--text-muted)';
    namePreviewList.appendChild(li);
  }

  totalCount.textContent = getAllNames().length;
}


/*   TEXT BOX OVERLAY     */

function getCanvasMetrics() {
  return {
    offsetX: 0,
    offsetY: 0,
    width: canvas.offsetWidth,
    height: canvas.offsetHeight,
  };
}

function clientToCanvasRel(clientX, clientY) {
  const canvasRect = canvas.getBoundingClientRect();
  const s = state.zoom;
  const unscaledW = canvas.offsetWidth;
  const unscaledH = canvas.offsetHeight;
  return {
    x: (clientX - canvasRect.left) / (unscaledW * s),
    y: (clientY - canvasRect.top) / (unscaledH * s),
  };
}

function updateTextBoxOverlay() {
  if (!state.certificateImage || !state.positionSet) {
    textBoxOverlay.style.display = 'none';
    return;
  }

  const m = getCanvasMetrics();

  textBoxOverlay.style.display = 'block';
  textBoxOverlay.style.left   = `${m.offsetX + state.boxX * m.width}px`;
  textBoxOverlay.style.top    = `${m.offsetY + state.boxY * m.height}px`;
  textBoxOverlay.style.width  = `${state.boxW * m.width}px`;
  textBoxOverlay.style.height = `${state.boxH * m.height}px`;
}

// Keep overlay in sync when the container / window is resized
const resizeObserver = new ResizeObserver(() => {
  if (state.positionSet) {
    updateTextBoxOverlay();
  }
});
resizeObserver.observe(canvasContainer);

/*   CANVAS ZOOM         */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.15;

function applyZoom(newZoom) {
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  canvasInner.style.transform = `scale(${state.zoom})`;
  zoomValueEl.textContent = `${Math.round(state.zoom * 100)}%`;
  setTimeout(() => {
    if (state.positionSet) updateTextBoxOverlay();
  }, 160); // after CSS transition
}

btnZoomIn.addEventListener('click', () => applyZoom(state.zoom + ZOOM_STEP));
btnZoomOut.addEventListener('click', () => applyZoom(state.zoom - ZOOM_STEP));
btnZoomReset.addEventListener('click', () => applyZoom(1.0));
if (btnZoomValueBtn) btnZoomValueBtn.addEventListener('click', () => applyZoom(1.0));

// Mouse-wheel zoom on the viewport
canvasViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  applyZoom(state.zoom + delta);
}, { passive: false });

// Ctrl+scroll anywhere (only when editor tab is visible)
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  const settingsPanel = tabPanels.settings;
  if (!settingsPanel || settingsPanel.hidden) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  applyZoom(state.zoom + delta);
}, { passive: false });

/*   NUDGE BUTTONS       */
const NUDGE_STEP = 0.005; // 0.5% of image size per press

function nudgeBox(dx, dy) {
  if (!state.certificateImage) return;
  state.boxX = Math.max(0, Math.min(1 - state.boxW, state.boxX + dx));
  state.boxY = Math.max(0, Math.min(1 - state.boxH, state.boxY + dy));
  state.positionSet = true;
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
  checkStepVisibility();
}

nudgeUp.addEventListener('click', () => nudgeBox(0, -NUDGE_STEP));
nudgeDown.addEventListener('click', () => nudgeBox(0, NUDGE_STEP));
nudgeLeft.addEventListener('click', () => nudgeBox(-NUDGE_STEP, 0));
nudgeRight.addEventListener('click', () => nudgeBox(NUDGE_STEP, 0));
nudgeCenter.addEventListener('click', () => {
  if (!state.certificateImage) return;
  state.boxX = (1 - state.boxW) / 2;
  state.boxY = (1 - state.boxH) / 2;
  state.positionSet = true;
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
  checkStepVisibility();
});

// Click on canvas to set box center position
canvasContainer.addEventListener('click', (e) => {
  if (!state.certificateImage) return;
  if (e.target.classList.contains('text-box-handle')) return;
  // Don't reposition if the user just finished dragging or resizing
  if (justFinishedInteraction) { justFinishedInteraction = false; return; }

  const { x: clickX, y: clickY } = clientToCanvasRel(e.clientX, e.clientY);

  // Ignore clicks outside the actual canvas area
  if (clickX < 0 || clickX > 1 || clickY < 0 || clickY > 1) return;

  const halfW = state.boxW / 2;
  const halfH = state.boxH / 2;
  state.boxX = Math.max(0, Math.min(1 - state.boxW, clickX - halfW));
  state.boxY = Math.max(0, Math.min(1 - state.boxH, clickY - halfH));
  state.positionSet = true;

  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
  checkStepVisibility();
});

// Dragging the text box
let isDragging = false;
let justFinishedInteraction = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

textBoxOverlay.addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('text-box-handle')) return;
  e.preventDefault();
  e.stopPropagation();
  isDragging = true;

  const { x, y } = clientToCanvasRel(e.clientX, e.clientY);
  dragOffsetX = x - state.boxX;
  dragOffsetY = y - state.boxY;

  textBoxOverlay.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging && !isResizing) return;

  const { x: mouseXRel, y: mouseYRel } = clientToCanvasRel(e.clientX, e.clientY);

  if (isDragging) {
    state.boxX = Math.max(0, Math.min(1 - state.boxW, mouseXRel - dragOffsetX));
    state.boxY = Math.max(0, Math.min(1 - state.boxH, mouseYRel - dragOffsetY));
    updateTextBoxOverlay();
    drawPreview();
  }

  if (isResizing) {
    handleResize(mouseXRel, mouseYRel);
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    justFinishedInteraction = true;
    textBoxOverlay.style.cursor = 'move';
    checkOverflow();
  }
  if (isResizing) {
    isResizing = false;
    resizeHandle = null;
    justFinishedInteraction = true;
    checkOverflow();
  }
});


/*   RESIZABLE BOX       */
let isResizing = false;
let resizeHandle = null;
let resizeStart = {};

$$('.text-box-handle').forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizeHandle = handle.dataset.handle;

    const { x, y } = clientToCanvasRel(e.clientX, e.clientY);
    resizeStart = {
      mouseX: x,
      mouseY: y,
      boxX: state.boxX,
      boxY: state.boxY,
      boxW: state.boxW,
      boxH: state.boxH,
    };
  });
});

function handleResize(mouseXRel, mouseYRel) {
  const dx = mouseXRel - resizeStart.mouseX;
  const dy = mouseYRel - resizeStart.mouseY;
  const MIN_SIZE = 0.03;

  let { boxX, boxY, boxW, boxH } = resizeStart;

  // Pre-compute the fixed (anchored) edges
  const rightEdge = boxX + boxW;
  const bottomEdge = boxY + boxH;

  switch (resizeHandle) {
    case 'br': // anchor: top-left
      boxW = Math.max(MIN_SIZE, boxW + dx);
      boxH = Math.max(MIN_SIZE, boxH + dy);
      break;
    case 'bl': // anchor: top-right — compute size first, derive position
      boxW = Math.max(MIN_SIZE, boxW - dx);
      boxX = rightEdge - boxW;
      boxH = Math.max(MIN_SIZE, boxH + dy);
      break;
    case 'tr': // anchor: bottom-left — compute size first, derive position
      boxW = Math.max(MIN_SIZE, boxW + dx);
      boxH = Math.max(MIN_SIZE, boxH - dy);
      boxY = bottomEdge - boxH;
      break;
    case 'tl': // anchor: bottom-right — compute size first, derive position
      boxW = Math.max(MIN_SIZE, boxW - dx);
      boxX = rightEdge - boxW;
      boxH = Math.max(MIN_SIZE, boxH - dy);
      boxY = bottomEdge - boxH;
      break;
    case 'mr': // anchor: left edge
      boxW = Math.max(MIN_SIZE, boxW + dx);
      break;
    case 'ml': // anchor: right edge
      boxW = Math.max(MIN_SIZE, boxW - dx);
      boxX = rightEdge - boxW;
      break;
    case 'bm': // anchor: top edge
      boxH = Math.max(MIN_SIZE, boxH + dy);
      break;
    case 'tm': // anchor: bottom edge
      boxH = Math.max(MIN_SIZE, boxH - dy);
      boxY = bottomEdge - boxH;
      break;
  }

  // Clamp to canvas bounds
  boxX = Math.max(0, boxX);
  boxY = Math.max(0, boxY);
  boxW = Math.min(boxW, 1 - boxX);
  boxH = Math.min(boxH, 1 - boxY);

  state.boxX = boxX;
  state.boxY = boxY;
  state.boxW = boxW;
  state.boxH = boxH;

  // Update sliders
  boxWidthSlider.value = Math.round(state.boxW * 100);
  boxWidthValue.textContent = Math.round(state.boxW * 100);
  boxHeightSlider.value = Math.round(state.boxH * 100);
  boxHeightValue.textContent = Math.round(state.boxH * 100);

  updateTextBoxOverlay();
  drawPreview();
}


/*   CANVAS DRAWING      */
function drawPreview() {
  if (!state.certificateImage) return;

  const img = state.certificateImage;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (state.positionSet) {
    drawTextBox(ctx, canvas.width, canvas.height, true);

    if (state.selectedColumns.length > 0) {
      const names = getAllNames();
      const sampleName = names.length > 0 ? names[0] : 'Örnek İsim';
      drawTextInBox(ctx, sampleName, canvas.width, canvas.height, false);
    }
  }
}

function drawTextBox(context, w, h, showBox) {
  if (!showBox) return;

  const bx = state.boxX * w;
  const by = state.boxY * h;
  const bw = state.boxW * w;
  const bh = state.boxH * h;

  context.save();
  context.strokeStyle = 'rgba(212, 175, 55, 0.7)';
  context.lineWidth = 3;
  context.setLineDash([10, 6]);
  context.strokeRect(bx, by, bw, bh);

  // Slightly tinted background
  context.fillStyle = 'rgba(212, 175, 55, 0.04)';
  context.fillRect(bx, by, bw, bh);
  context.restore();
}

function measureTextWidth(context, text, fontStr) {
  context.save();
  context.font = fontStr;
  const metrics = context.measureText(text);
  context.restore();
  return metrics.width;
}

function getFontString(size, weight, family) {
  return `${weight} ${size}px "${family}"`;
}

function drawTextInBox(context, text, w, h, forExport) {
  const bx = state.boxX * w;
  const by = state.boxY * h;
  const bw = state.boxW * w;
  const bh = state.boxH * h;

  let fontSize = state.fontSize;
  let fontStr = getFontString(fontSize, state.fontWeight, state.fontFamily);

  // Auto-shrink if text doesn't fit
  let textWidth = measureTextWidth(context, text, fontStr);
  while (textWidth > bw && fontSize > 8) {
    fontSize--;
    fontStr = getFontString(fontSize, state.fontWeight, state.fontFamily);
    textWidth = measureTextWidth(context, text, fontStr);
  }

  // Also check height
  while (fontSize > bh * 0.85 && fontSize > 8) {
    fontSize--;
  }
  fontStr = getFontString(fontSize, state.fontWeight, state.fontFamily);

  context.save();
  context.font = fontStr;
  context.fillStyle = state.fontColor;
  context.textBaseline = 'middle';

  let x;
  if (state.textAlign === 'center') {
    context.textAlign = 'center';
    x = bx + bw / 2;
  } else if (state.textAlign === 'left') {
    context.textAlign = 'left';
    x = bx + 10; // small padding
  } else {
    context.textAlign = 'right';
    x = bx + bw - 10;
  }

  const y = by + bh / 2;

  context.fillText(text, x, y);
  context.restore();
}


/*   OVERFLOW DETECTION  */
function checkOverflow() {
  if (!state.certificateImage || !state.positionSet || state.selectedColumns.length === 0) {
    state.overflowNames = [];
    overflowWarning.style.display = 'none';
    return;
  }

  const names = getAllNames();
  const w = state.certificateImage.naturalWidth;
  const bw = state.boxW * w;
  const bh = state.boxH * state.certificateImage.naturalHeight;

  // Create temp canvas for measuring
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  state.overflowNames = [];

  names.forEach(name => {
    const fontStr = getFontString(state.fontSize, state.fontWeight, state.fontFamily);
    const textWidth = measureTextWidth(tempCtx, name, fontStr);
    const textOverflows = textWidth > bw || state.fontSize > bh * 0.85;

    if (textOverflows) {
      // Calculate what size it needs
      let neededSize = state.fontSize;
      let currentStr = getFontString(neededSize, state.fontWeight, state.fontFamily);
      let w2 = measureTextWidth(tempCtx, name, currentStr);
      while ((w2 > bw || neededSize > bh * 0.85) && neededSize > 8) {
        neededSize--;
        currentStr = getFontString(neededSize, state.fontWeight, state.fontFamily);
        w2 = measureTextWidth(tempCtx, name, currentStr);
      }

      state.overflowNames.push({ name, originalSize: state.fontSize, adjustedSize: neededSize });
    }
  });

  if (state.overflowNames.length > 0) {
    overflowWarning.style.display = 'flex';
    overflowCountEl.textContent = state.overflowNames.length;
  } else {
    overflowWarning.style.display = 'none';
  }
}


/*   CENTERING BUTTONS   */
btnCenterH.addEventListener('click', () => {
  if (!state.certificateImage) return;
  state.boxX = (1 - state.boxW) / 2;
  state.positionSet = true;
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
  checkStepVisibility();
});

btnCenterV.addEventListener('click', () => {
  if (!state.certificateImage) return;
  state.boxY = (1 - state.boxH) / 2;
  state.positionSet = true;
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
  checkStepVisibility();
});


/*   BOX SIZE SLIDERS    */
boxWidthSlider.addEventListener('input', () => {
  state.boxW = parseInt(boxWidthSlider.value) / 100;
  boxWidthValue.textContent = boxWidthSlider.value;
  // Ensure box stays in bounds
  state.boxX = Math.min(state.boxX, 1 - state.boxW);
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
});

boxHeightSlider.addEventListener('input', () => {
  state.boxH = parseInt(boxHeightSlider.value) / 100;
  boxHeightValue.textContent = boxHeightSlider.value;
  state.boxY = Math.min(state.boxY, 1 - state.boxH);
  updateTextBoxOverlay();
  drawPreview();
  checkOverflow();
});


/*   CONTROLS LISTENERS  */
fontFamilySelect.addEventListener('change', () => {
  state.fontFamily = fontFamilySelect.value;

  // Wait for font to be ready before drawing
  document.fonts.load(`${state.fontWeight} ${state.fontSize}px "${state.fontFamily}"`).then(() => {
    drawPreview();
    checkOverflow();
  });
});

fontSizeSlider.addEventListener('input', () => {
  state.fontSize = parseInt(fontSizeSlider.value);
  fontSizeValue.textContent = fontSizeSlider.value;
  drawPreview();
  checkOverflow();
});

// Font size ± step buttons
btnFontIncrease.addEventListener('click', () => {
  const newVal = Math.min(200, state.fontSize + 2);
  fontSizeSlider.value = newVal;
  state.fontSize = newVal;
  fontSizeValue.textContent = newVal;
  drawPreview();
  checkOverflow();
});

btnFontDecrease.addEventListener('click', () => {
  const newVal = Math.max(10, state.fontSize - 2);
  fontSizeSlider.value = newVal;
  state.fontSize = newVal;
  fontSizeValue.textContent = newVal;
  drawPreview();
  checkOverflow();
});

fontWeightSelect.addEventListener('change', () => {
  state.fontWeight = fontWeightSelect.value;
  document.fonts.load(`${state.fontWeight} ${state.fontSize}px "${state.fontFamily}"`).then(() => {
    drawPreview();
    checkOverflow();
  });
});

fontColorInput.addEventListener('input', () => {
  state.fontColor = fontColorInput.value;
  fontColorHex.textContent = fontColorInput.value;
  drawPreview();
});

alignButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    alignButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.textAlign = btn.dataset.align;
    drawPreview();
  });
});

textTransformSelect.addEventListener('change', () => {
  state.textTransform = textTransformSelect.value;
  updateNamePreview();
  drawPreview();
  checkOverflow();
});

prefixInput.addEventListener('input', () => {
  state.prefix = prefixInput.value;
  updateNamePreview();
  drawPreview();
  checkOverflow();
});

outputFormatSelect.addEventListener('change', () => {
  state.outputFormat = outputFormatSelect.value;
});


/*   OVERFLOW MODAL      */
btnOverflowDetails.addEventListener('click', () => {
  overflowList.innerHTML = '';

  state.overflowNames.forEach(({ name, originalSize, adjustedSize }) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="overflow-name">${name}</span>
      <span class="overflow-sizes">${originalSize}px → ${adjustedSize}px</span>
    `;
    overflowList.appendChild(li);
  });

  overflowModal.style.display = 'flex';
});

btnModalClose.addEventListener('click', () => {
  overflowModal.style.display = 'none';
});

btnModalOk.addEventListener('click', () => {
  overflowModal.style.display = 'none';
});

overflowModal.addEventListener('click', (e) => {
  if (e.target === overflowModal) {
    overflowModal.style.display = 'none';
  }
});


/*   STEP VISIBILITY     */
function checkStepVisibility() {
  const hasImage = !!state.certificateImage;
  const hasCsv = state.csvData.length > 0;
  const hasColumns = state.selectedColumns.length > 0;

  // Enable/disable tab buttons
  tabBtn2.disabled = !hasCsv;
  tabBtn3.disabled = !(hasImage && hasCsv && hasColumns);
  tabBtn4.disabled = !(hasImage && hasColumns && state.positionSet);

  // Enable/disable the nav buttons
  if (btnUploadNext)   btnUploadNext.disabled   = !hasCsv;
  if (btnColumnsNext)  btnColumnsNext.disabled  = !(hasImage && hasCsv && hasColumns);
  if (btnSettingsNext) btnSettingsNext.disabled  = !(hasImage && hasColumns && state.positionSet);

  if (hasImage && hasColumns && state.positionSet) {
    if (totalCount) totalCount.textContent = getAllNames().length;
    checkOverflow();
  }
}

// İleri buttons
if (btnColumnsNext)
  btnColumnsNext.addEventListener('click', () => showTab('settings'));
if (btnUploadNext)
  btnUploadNext.addEventListener('click', () => showTab('columns'));
if (btnSettingsNext)
  btnSettingsNext.addEventListener('click', () => showTab('generate'));

// Overflow dismiss button
if (btnOverflowDismiss) {
  btnOverflowDismiss.addEventListener('click', () => {
    overflowWarning.style.display = 'none';
  });
}


/*   CERTIFICATE GEN     */
btnGenerate.addEventListener('click', async () => {
  const names = getAllNames();
  if (names.length === 0) return;

  // Ensure font is loaded
  try {
    await document.fonts.load(`${state.fontWeight} ${state.fontSize}px "${state.fontFamily}"`);
  } catch (e) {
    // continue anyway
  }

  btnGenerate.disabled = true;
  progressSection.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Sertifikalar oluşturuluyor...';

  const zip = new JSZip();
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');
  offCanvas.width = state.certificateImage.naturalWidth;
  offCanvas.height = state.certificateImage.naturalHeight;

  const format = state.outputFormat;
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    offCtx.drawImage(state.certificateImage, 0, 0, offCanvas.width, offCanvas.height);
    // No text box drawn in exported image, only text
    drawTextInBox(offCtx, name, offCanvas.width, offCanvas.height, true);

    const blob = await new Promise(resolve => {
      offCanvas.toBlob(resolve, mimeType, 0.95);
    });

    const safeName = name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    zip.file(`${safeName}.${ext}`, blob);

    const percent = Math.round(((i + 1) / names.length) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${i + 1} / ${names.length} oluşturuldu (${percent}%)`;

    await new Promise(r => setTimeout(r, 0));
  }

  progressText.textContent = 'ZIP dosyası hazırlanıyor...';

  const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    progressBar.style.width = `${Math.round(metadata.percent)}%`;
  });

  saveAs(zipBlob, 'sertifikalar.zip');

  progressText.textContent = `✅ ${names.length} sertifika başarıyla oluşturuldu!`;
  progressBar.style.width = '100%';
  btnGenerate.disabled = false;
});


/*   INIT                */
setupDropzone(imageDropzone, imageInput, handleImageUpload);
setupDropzone(csvDropzone, csvInput, handleCsvUpload);
