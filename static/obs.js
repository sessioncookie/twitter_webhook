/* obs.js - OBS Designer Logic (Plugin System V9) */

// ==========================================
//  0. 全域變數與設定
// ==========================================

// 靜態參數列表 (這些是固定的核心設定)
// 注意：移除了原本的 fxFlow, fxScanline 等，因為現在由 Plugin 管理
const staticInputIds = [
    'fontSize', 'fontColor', 'fontY', 'fontX', 'fontStroke', 'fontShadow',
    'barHeight', 'barRadius', 'borderWidth', 'barPadding',
    'trackColor', 'trackOpacity', 'fillColor1', 'fillColor2', 'fillAngle'
];

let serverTemplatesCache = {};
let turnstileToken = null;

// 核心預設值 (外觀基礎)
const defaultState = {
    fontSize: 50, fontColor: "#ffffff", fontY: 0, fontX: 0,
    fontStroke: false, fontShadow: true,
    barHeight: 60, barRadius: 80, borderWidth: 0, barPadding: 0,
    trackColor: "#333333", trackOpacity: 100,
    fillColor1: "#00ffcc", fillColor2: "#0099ff", fillAngle: 90
};

// ==========================================
//  1. FX Registry (特效插件系統)
// ==========================================
window.FX_REGISTRY = {
    modules: {}, // 存放模組定義
    state: {},   // 存放當前數值 { fx_id: { enabled: true, speed: 5 ... } }

    /**
     * 註冊一個特效模組 (由 .js 插件呼叫)
     */
    register: function(moduleDef) {
        console.log(`[FX] 註冊模組: ${moduleDef.name} (${moduleDef.id})`);
        this.modules[moduleDef.id] = moduleDef;

        // 初始化該特效的狀態
        if (!this.state[moduleDef.id]) {
            this.state[moduleDef.id] = { enabled: moduleDef.enable || false };
            if (moduleDef.params) {
                moduleDef.params.forEach(p => {
                    this.state[moduleDef.id][p.id] = p.value;
                });
            }
        }
    },

    /**
     * 從後端載入所有特效腳本
     */
    loadAll: async function() {
        const container = document.getElementById('fx-dynamic-container');
        if (!container) return; // 防呆

        container.innerHTML = '<div style="text-align:center; padding:10px; color:#888;">正在載入特效插件...</div>';

        try {
            // 1. 呼叫 API 取得檔案列表
            const res = await fetch('/fx/list');
            if (!res.ok) throw new Error("API Error");
            const files = await res.json();

            // 2. 動態插入 Script 標籤
            const promises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = `static/fx/${file}?t=${new Date().getTime()}`; // 防止快取
                    script.onload = resolve;
                    script.onerror = (e) => {
                        console.warn(`無法載入 ${file}`, e);
                        resolve(); // 失敗也繼續，不卡流程
                    };
                    document.body.appendChild(script);
                });
            });

            await Promise.all(promises);
            
            // 3. 渲染 UI
            this.renderUI(container);
            
            // 4. 初次生成 CSS
            window.generateCSS();

        } catch (e) {
            console.error("[FX] Load Error:", e);
            container.innerHTML = `
                <div style="text-align:center; color:#aaa; font-size:12px;">
                    <i class="fas fa-exclamation-triangle"></i> 無法連接特效伺服器<br>
                    (僅載入基礎功能)
                </div>`;
            window.generateCSS();
        }
    },

    /**
     * 動態生成控制面板 UI
     */
    renderUI: function(container) {
        container.innerHTML = '';
        const moduleIds = Object.keys(this.modules);

        if (moduleIds.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666;">無可用特效</div>';
            return;
        }

        moduleIds.forEach(id => {
            const mod = this.modules[id];
            const modState = this.state[id];

            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = "15px";
            wrapper.style.borderBottom = "1px dashed rgba(255,255,255,0.1)";
            wrapper.style.paddingBottom = "10px";

            // 標題開關 (Checkbox)
            const header = document.createElement('label');
            header.className = "checkbox-label";
            header.style.fontWeight = "bold";
            header.innerHTML = `
                <input type="checkbox" 
                    ${modState.enabled ? 'checked' : ''} 
                    onchange="FX_REGISTRY.toggle('${id}', this.checked)">
                ${mod.name}
            `;
            wrapper.appendChild(header);

            // 參數區 (Params)
            if (mod.params && mod.params.length > 0) {
                const paramsDiv = document.createElement('div');
                paramsDiv.style.paddingLeft = "20px";
                paramsDiv.style.transition = "opacity 0.2s";
                paramsDiv.style.opacity = modState.enabled ? "1" : "0.5";
                paramsDiv.style.pointerEvents = modState.enabled ? "auto" : "none";
                paramsDiv.id = `fx-params-${id}`;

                mod.params.forEach(p => {
                    const row = document.createElement('div');
                    row.className = "control-row";
                    
                    // 根據類型生成不同的 input
                    if (p.type === 'range') {
                        row.innerHTML = `
                            <label>${p.label}</label>
                            <div class="input-group">
                                <input type="range" 
                                    min="${p.min}" max="${p.max}" step="${p.step||1}" 
                                    value="${modState[p.id]}"
                                    oninput="FX_REGISTRY.updateParam('${id}', '${p.id}', this.value, this)">
                                <input type="number" 
                                    value="${modState[p.id]}" 
                                    step="${p.step||1}"
                                    style="width:50px; text-align:right;" 
                                    onchange="FX_REGISTRY.updateParam('${id}', '${p.id}', this.value, this)">
                            </div>
                        `;
                    } else if (p.type === 'color') {
                        row.innerHTML = `
                            <label>${p.label}</label>
                            <input type="color" value="${modState[p.id]}"
                                oninput="FX_REGISTRY.updateParam('${id}', '${p.id}', this.value, this)">
                        `;
                    }
                    // 可在此擴充 select, text 等
                    
                    paramsDiv.appendChild(row);
                });
                wrapper.appendChild(paramsDiv);
            }
            container.appendChild(wrapper);
        });
    },

    /**
     * UI 互動：切換開關
     */
    toggle: function(modId, isChecked) {
        if (this.state[modId]) {
            this.state[modId].enabled = isChecked;
            const paramDiv = document.getElementById(`fx-params-${modId}`);
            if(paramDiv) {
                paramDiv.style.opacity = isChecked ? "1" : "0.5";
                paramDiv.style.pointerEvents = isChecked ? "auto" : "none";
            }
            window.generateCSS();
        }
    },

    /**
     * UI 互動：更新參數
     */
    updateParam: function(modId, paramId, value, sourceEl) {
        // 更新狀態
        this.state[modId][paramId] = value;
        
        // 如果是 slider，連動更新旁邊的 number input (反之亦然)
        if (sourceEl) {
            const parent = sourceEl.closest('.input-group');
            if (parent) {
                const sibling = parent.querySelector(sourceEl.type === 'range' ? 'input[type="number"]' : 'input[type="range"]');
                if (sibling) sibling.value = value;
            }
        }
        
        window.generateCSS();
    },

    /**
     * 取得所有啟用特效的 CSS
     */
    getAllCSS: function(globalVars) {
        let finalCSS = "";
        Object.keys(this.modules).forEach(id => {
            const mod = this.modules[id];
            const st = this.state[id];
            
            if (st && st.enabled && typeof mod.generateCSS === 'function') {
                finalCSS += `\n/* FX: ${mod.name} */\n`;
                finalCSS += mod.generateCSS(st, globalVars);
            }
        });
        return finalCSS;
    },

    /**
     * 匯入外部存檔的 FX 狀態
     */
    importState: function(savedFxState) {
        if (!savedFxState) return;
        
        Object.keys(savedFxState).forEach(id => {
            // 如果此特效模組存在，則覆蓋其設定
            if (this.state[id]) {
                this.state[id] = { ...this.state[id], ...savedFxState[id] };
            } else {
                // 如果模組尚未載入 (或已被移除)，暫存狀態，等待模組註冊
                this.state[id] = savedFxState[id];
            }
        });
        // 重新渲染 UI 以反映匯入的值
        const container = document.getElementById('fx-dynamic-container');
        if(container) this.renderUI(container);
    }
};


// ==========================================
//  2. 初始化與事件綁定
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 設定年份
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. 初始化 Particles
    if (window.particlesJS) {
        particlesJS("particles-js", {
            particles: {
                number: { value: 60, density: { enable: true, value_area: 800 } },
                color: { value: "#ffffff" }, shape: { type: "circle" }, opacity: { value: 0.3 },
                size: { value: 3, random: true },
                line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.2, width: 1 },
                move: { enable: true, speed: 1, random: true }
            },
            interactivity: {
                detect_on: "canvas",
                events: { onhover: { enable: true, mode: "grab" }, onclick: { enable: true, mode: "push" } },
                modes: { grab: { distance: 140 }, push: { particles_nb: 3 } }
            },
            retina_detect: true
        });
    }

    // 3. 綁定基礎 UI 控制項
    setupEventListeners();

    // 4. 初始化預設畫面
    initDefaultState();

    // 5. 嘗試載入伺服器模板列表
    loadServerTemplatesList();

    // 6. [關鍵] 載入特效插件系統
    FX_REGISTRY.loadAll();
});

function initDefaultState() {
    Object.keys(defaultState).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === "checkbox") {
            el.checked = defaultState[id];
        } else {
            el.value = defaultState[id];
        }
    });
    // 注意：這裡不呼叫 generateCSS，因為要等 FX 載入完畢再一起生成
}

function setupEventListeners() {
    // 綁定 Slider 與 Number Input 的連動
    document.querySelectorAll('.param-slider').forEach(slider => {
        const targetId = slider.dataset.target;
        const numberInput = document.getElementById(targetId);
        if (numberInput) {
            slider.addEventListener('input', () => { numberInput.value = slider.value; generateCSS(); });
            numberInput.addEventListener('input', () => { slider.value = numberInput.value; generateCSS(); });
        }
    });

    // 綁定所有靜態輸入框
    staticInputIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) { 
            el.addEventListener('input', generateCSS); 
            el.addEventListener('change', generateCSS); 
        }
    });
}

// ==========================================
//  3. 核心功能 (CSS 生成)
// ==========================================

// 模擬預覽更新 (不影響輸出 CSS)
window.updateSim = function() {
    const text = document.getElementById('sim-text').value;
    const val = document.getElementById('sim-val').value;
    const percent = document.getElementById('sim-percent').value;

    const labelEl = document.getElementById('p-label');
    const valueEl = document.getElementById('p-value');
    const barEl = document.querySelector('.progress-bar');

    if(labelEl) labelEl.innerText = text;
    if(valueEl) valueEl.innerText = val;
    if(barEl) barEl.style.width = percent + "%";
}

// 工具函數: Hex 轉 RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
}

// 核心 CSS 生成器
window.generateCSS = function() {
    // 1. 收集靜態參數
    let v = {};
    staticInputIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) v[id] = el.type === 'checkbox' ? el.checked : el.value;
    });

    // Fallback
    if(!v.trackColor) v = defaultState;

    // 2. 計算基礎變數
    const rgbTrack = hexToRgb(v.trackColor || "#333");
    const trackRgba = `rgba(${rgbTrack}, ${v.trackOpacity/100})`;
    const rgbFill1 = hexToRgb(v.fillColor1 || "#00ffcc");
    const rgbFont = hexToRgb(v.fontColor || "#fff");

    // 3. 處理文字樣式
    const textShadow = v.fontShadow ? `0 0 5px rgba(${rgbFont}, 0.8), 0 0 10px rgba(${rgbFill1}, 0.5)` : 'none';
    const textStroke = v.fontStroke ? `-webkit-text-stroke: 1px rgba(0,0,0,0.8);` : '';

    // 4. 取得所有動態特效 CSS (Plugin System)
    // 我們將目前的變數 v 傳給插件，方便插件使用主色調等資訊
    const fxCSS = FX_REGISTRY.getAllCSS(v);

    // 5. 組合最終 CSS
    const css = `/* Generated by 三玄庫崎 OBS Designer */
body, html { overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
body::-webkit-scrollbar { display: none !important; }

/* 進度條容器 */
#goalDiv { position: relative !important; }

/* 文字區塊 */
#goalDiv #goalBackground {
    position: absolute !important; top: 50% !important; left: 0 !important; width: 100% !important; text-align: center !important; transform: translateY(-50%) !important;
    margin-top: ${v.fontY}px !important; margin-left: ${v.fontX}px !important; z-index: 100 !important;
    font-family: "Microsoft JhengHei", system-ui, sans-serif !important; font-weight: 800 !important; color: ${v.fontColor} !important; font-size: ${v.fontSize}px !important;
    background: none !important; -webkit-background-clip: border-box !important; text-shadow: ${textShadow} !important; ${textStroke}
}

/* 進度條軌道 (背景) */
#goalDiv .progress {
    --bs-progress-bg: ${trackRgba} !important;
    width: 100% !important; height: ${v.barHeight}px !important;
    background: ${trackRgba} !important; background-color: ${trackRgba} !important;
    border-radius: ${v.barRadius}px !important; border: ${v.borderWidth}px solid rgba(255,255,255,0.1) !important;
    padding: ${v.barPadding}px !important; box-shadow: inset 0 0 10px rgba(0,0,0,0.5) !important;
    overflow: hidden !important; position: relative !important; z-index: 1 !important;
    transform: translateZ(0); /* GPU Fix */
}

/* 進度條本體 */
#goalDiv .progress .progress-bar {
    height: 100% !important; border-radius: inherit !important;
    background: linear-gradient(${v.fillAngle}deg, ${v.fillColor1}, ${v.fillColor2}) !important;
    position: relative !important; z-index: 10 !important; overflow: hidden !important; transition: width 0.3s ease !important;
    /* 注意：陰影特效現在建議寫在 Plugin 裡，或者在這裡保留基礎陰影 */
}

/* ==================
   Plugin FX Section
   ================== */
${fxCSS}
`;

    // 6. 輸出到網頁
    const outputBox = document.getElementById('css-output');
    if(outputBox) outputBox.value = css;
    
    const styleTag = document.getElementById('dynamic-styles');
    if(styleTag) styleTag.innerHTML = css;
}

// ==========================================
//  4. 資料處理 (Local & Server)
// ==========================================

// 取得完整狀態 (包含靜態參數與 FX 參數)
function getCurrentState() {
    const data = {};
    // 1. 靜態
    staticInputIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) data[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    // 2. 動態 FX
    data.fx = FX_REGISTRY.state;
    
    return data;
}

// 應用狀態
function applyState(data) {
    if (!data) return;

    // 1. 應用靜態參數
    Object.keys(data).forEach(key => {
        if (key === 'fx') return; // 跳過 fx 區塊
        
        const el = document.getElementById(key);
        if (el) {
            if (el.type === 'checkbox') el.checked = data[key];
            else el.value = data[key];
            // 觸發 input 事件以更新滑桿 UI
            el.dispatchEvent(new Event('input')); 
        }
    });

    // 2. 應用 FX 參數
    if (data.fx) {
        FX_REGISTRY.importState(data.fx);
    }

    // 3. 強制刷新
    generateCSS();
    updateSim();
}

// 載入伺服器模板列表
window.loadServerTemplatesList = async function() {
    const select = document.getElementById('presetSelector');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Loading...</option>';

    try {
        const response = await fetch('/gettemplate');
        if (!response.ok) throw new Error("Server offline");

        const data = await response.json();
        serverTemplatesCache = data;

        select.innerHTML = '<option value="" disabled selected>-- 選擇伺服器模板 --</option>';
        if (data && typeof data === 'object') {
            for (const [filename, content] of Object.entries(data)) {
                const option = document.createElement('option');
                option.value = filename; 
                option.innerText = `☁️ ${filename}`;
                select.appendChild(option);
            }
        }
    } catch (error) {
        console.warn('本地模式啟動 (無法連接伺服器)');
        select.innerHTML = '<option value="" disabled selected>-- 本地模式 (無伺服器) --</option>';
    }
}

// 儲存到伺服器
window.saveToServer = async function() {
    const name = document.getElementById('templateName').value;
    if(!name) { alert("請輸入模板名稱！"); return; }
    
    const state = getCurrentState();
    
    const payload = {
        filename: name,
        cssdata: state,
        ts_token: turnstileToken
    };

    try {
        const response = await fetch('/savetemplate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const resData = await response.json();
            alert(`成功: ${resData.message}`);
            loadServerTemplatesList();
        } else {
            const errData = await response.json().catch(() => ({}));
            alert(`儲存失敗: ${errData.detail || response.statusText}`);
        }
    } catch (error) {
        alert("無法連接到伺服器 (請確認是否已啟動後端)");
    }
};

window.loadServerTemplate = function(filename) {
    if (!serverTemplatesCache) return;
    const templateData = serverTemplatesCache[filename];
    if (templateData) {
        applyState(templateData);
        document.getElementById('templateName').value = filename;
    }
};

// 本地匯出
window.exportLocalJson = function() {
    const data = getCurrentState();
    const name = document.getElementById('templateName').value || `obs-goal-${Date.now()}`;
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// 本地匯入
window.importLocalJson = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            applyState(data);
            if(!document.getElementById('templateName').value) {
                 document.getElementById('templateName').value = file.name.replace('.json', '');
            }
        } catch (err) { alert('格式錯誤'); }
    };
    reader.readAsText(file);
    input.value = '';
};

window.copyCSS = function() {
    document.getElementById('css-output').select();
    document.execCommand('copy');
    alert("CSS 已複製！");
};

window.toggleAcc = function(header) {
    header.parentElement.classList.toggle('active');
};

// Turnstile Callback
window.onTurnstileReady = function(token) {
    console.log("Turnstile Token 獲取成功");
    turnstileToken = token;
};