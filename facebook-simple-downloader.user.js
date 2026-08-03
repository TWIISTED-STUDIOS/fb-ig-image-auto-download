// ==UserScript==
// @name         Facebook Image Downloader - Verified Full Resolution
// @namespace    https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download
// @version      1.0.4-beta.1
// @description  Deep-scan Facebook photos, resolve verified maximum-resolution files, check a chosen folder for existing images, and download individually or in bulk.
// @author       Bibek Chand Sah (original project); TWIISTED-STUDIOS contributors (maintained rewrite)
// @homepageURL  https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download
// @supportURL   https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/issues
// @downloadURL  https://raw.githubusercontent.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/main/facebook-simple-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/main/facebook-simple-downloader.user.js
// @match        https://www.facebook.com/*
// @match        https://facebook.com/*
// @match        https://m.facebook.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      facebook.com
// @connect      fbcdn.net
// @connect      fbsbx.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const IDS = {
        button: 'fb-fullres-folder-scan-button',
        stallBadge: 'fb-fullres-folder-stall-badge',
        menu: 'fb-fullres-folder-menu',
        scanAction: 'fb-fullres-folder-scan-action',
        overlay: 'fb-fullres-folder-overlay',
        modal: 'fb-fullres-folder-modal',
        status: 'fb-fullres-folder-status',
        container: 'fb-fullres-main-container',
        toast: 'fb-fullres-toast'
    };

    const SETTINGS = {
        // A round is one viewport-sized scroll step, or one bottom-of-page probe.
        maxRounds: 320,
        settleRounds: 10,
        scrollDelayMs: 1800,
        bottomDelayMs: 3000,
        initialDelayMs: 1400,
        requestTimeoutMs: 120000,
        minimumRenderedSide: 80,
        scrollStepRatio: 0.88,
        pickerId: 'fb-fullres-download',
        sessionKey: 'fbfr-photo-window-v0.6.1-manifest',
        resolverWindowName: 'fbFullResResolver',
        resolverTimeoutMs: 45000,
        resolverPollMs: 350,
        minimumSavedSide: 600,
        historyKey: 'fbfr-download-history-v0.7.5',
        historyLimit: 5000
    };

    const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];

    let scanning = false;
    let downloading = false;
    let cancelRequested = false;
    let stopScanRequested = false;
    let resolverWindowHandle = null;
    let inlineScanTimer = null;
    let launcherResizeHandler = null;
    let retainedProfileKey = '';
    const retainedImages = new Map();
    const inlineProcessedImages = new WeakSet();
    let downloadHistory = loadDownloadHistory();
    let accountNameCache = { routeKey: '', value: '' };

    GM_addStyle(`
        #${IDS.button} {
            position: fixed;
            top: 112px;
            right: 10px;
            z-index: 9998;
            padding: 10px 14px;
            border: 0;
            border-radius: 7px;
            background: #047857;
            color: #fff;
            font: 700 13px/1.2 Arial, sans-serif;
            cursor: pointer;
            box-shadow: 0 3px 12px rgba(0,0,0,.28);
        }
        #${IDS.button}:hover { background: #065f46; }
        #${IDS.button}:disabled { opacity: .72; cursor: progress; }

        #${IDS.overlay} {
            position: fixed;
            inset: 0;
            z-index: 10050;
            padding: 20px;
            background: rgba(0,0,0,.84);
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        #${IDS.modal} {
            width: min(1220px, 97vw);
            max-height: 94vh;
            background: #fff;
            color: #111827;
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 70px rgba(0,0,0,.5);
            font: 14px/1.4 Arial, sans-serif;
        }
        .fbfr-header, .fbfr-toolbar {
            padding: 14px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            border-bottom: 1px solid #dbe4f0;
        }
        .fbfr-header h2 { margin: 0; font-size: 19px; }
        .fbfr-subtitle { color: #475569; font-size: 12px; margin-top: 3px; }
        .fbfr-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .fbfr-actions button {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            background: #fff;
            color: #0f172a;
            padding: 8px 11px;
            cursor: pointer;
            font-weight: 600;
        }
        .fbfr-actions button:hover { background: #eff6ff; }
        .fbfr-actions button.fbfr-primary {
            background: #047857;
            border-color: #047857;
            color: #fff;
        }
        .fbfr-actions button.fbfr-primary:hover { background: #065f46; }
        .fbfr-actions button:disabled { opacity: .65; cursor: progress; }
        #${IDS.status} {
            flex: 1 1 380px;
            min-width: 260px;
            font-size: 12px;
            color: #334155;
        }
        .fbfr-grid {
            padding: 16px;
            overflow: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
            gap: 13px;
            background: #f8fafc;
        }
        .fbfr-card {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            border: 1px solid #dbe4f0;
            border-radius: 9px;
            background: #fff;
            box-shadow: 0 3px 10px rgba(15,23,42,.06);
        }
        .fbfr-card-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 700;
        }
        .fbfr-card-title input { width: 18px; height: 18px; }
        .fbfr-card img {
            width: 100%;
            height: 165px;
            object-fit: cover;
            border-radius: 7px;
            background: #e5e7eb;
        }
        .fbfr-meta {
            display: flex;
            align-items: center;
            gap: 5px;
            color: #475569;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.3;
        }
        .fbfr-meta-info {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 15px;
            height: 15px;
            border: 1px solid #94a3b8;
            border-radius: 50%;
            color: #64748b;
            font-size: 10px;
            font-weight: 700;
            cursor: help;
            flex: 0 0 auto;
        }
        .fbfr-meta-info::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: calc(100% + 9px);
            z-index: 30;
            width: min(360px, 75vw);
            padding: 10px 12px;
            border-radius: 7px;
            background: #0f172a;
            color: #f8fafc;
            box-shadow: 0 8px 24px rgba(15,23,42,.28);
            font-size: 11px;
            font-weight: 500;
            line-height: 1.45;
            white-space: pre-line;
            text-align: left;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transform: translate(-50%, 4px);
            transition: opacity .12s ease, transform .12s ease, visibility .12s ease;
        }
        .fbfr-meta-info::before {
            content: '';
            position: absolute;
            left: 50%;
            bottom: calc(100% + 3px);
            z-index: 31;
            border: 6px solid transparent;
            border-top-color: #0f172a;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transform: translateX(-50%);
            transition: opacity .12s ease, visibility .12s ease;
        }
        .fbfr-meta-info:hover::after,
        .fbfr-meta-info:focus-visible::after,
        .fbfr-meta-info:hover::before,
        .fbfr-meta-info:focus-visible::before {
            opacity: 1;
            visibility: visible;
        }
        .fbfr-meta-info:hover::after,
        .fbfr-meta-info:focus-visible::after {
            transform: translate(-50%, 0);
        }
        .fbfr-resolution-state {
            padding: 6px 8px;
            border-radius: 6px;
            background: #f1f5f9;
            color: #334155;
            font-size: 11px;
            font-weight: 700;
        }
        .fbfr-resolution-state[data-state="working"] {
            background: #eff6ff;
            color: #1d4ed8;
        }
        .fbfr-resolution-state[data-state="success"] {
            background: #ecfdf5;
            color: #047857;
        }
        .fbfr-resolution-state[data-state="error"] {
            background: #fef2f2;
            color: #b91c1c;
        }
        .fbfr-filename-settings {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1 1 410px;
            min-width: 280px;
            font-size: 12px;
            color: #334155;
        }
        .fbfr-filename-settings label { font-weight: 700; white-space: nowrap; }
        .fbfr-filename-settings input {
            flex: 1 1 210px;
            min-width: 150px;
            max-width: 330px;
            padding: 7px 9px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font: inherit;
        }
        .fbfr-filename-help { color: #64748b; font-size: 11px; }
        .fbfr-filename-preview { color: #475569; font-size: 11px; font-weight: 400; }
        .fbfr-fallback-option {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 9px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            background: #fff;
            color: #334155;
            font-size: 12px;
            cursor: pointer;
        }
        .fbfr-fallback-option input { margin: 0; }

        /* Original-script inspired appearance. */
        #${IDS.container} {
            position: fixed;
            top: 60px;
            right: 10px;
            z-index: 9999;
            display: inline-block;
        }
        #${IDS.button} {
            position: relative;
            top: auto;
            right: auto;
            width: 44px;
            height: 40px;
            padding: 0;
            border-radius: 7px;
            background: #16a34a;
            color: #fff;
            box-shadow: 0 2px 5px rgba(0,0,0,.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            line-height: 1;
            transition: transform .2s ease, background .2s ease, color .2s ease, box-shadow .2s ease;
        }
        #${IDS.button}:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,.4);
        }
        #${IDS.button}[data-scan-state="idle"] { background: #16a34a; color: #fff; }
        #${IDS.button}[data-scan-state="idle"]:hover,
        #${IDS.button}[data-scan-state="idle"][aria-expanded="true"] { background: #15803d; }
        #${IDS.button}[data-scan-state="progress"] {
            background: #eab308;
            color: #111827;
            animation: fbfr-menu-pulse-progress 1.25s ease-in-out infinite;
        }
        #${IDS.button}[data-scan-state="progress"]:hover,
        #${IDS.button}[data-scan-state="progress"][aria-expanded="true"] { background: #ca8a04; }
        #${IDS.button}[data-scan-state="stalled"] {
            background: #dc2626;
            color: #fff;
            animation: fbfr-menu-pulse-stalled .95s ease-in-out infinite;
        }
        #${IDS.button}[data-scan-state="stalled"]:hover,
        #${IDS.button}[data-scan-state="stalled"][aria-expanded="true"] { background: #b91c1c; }
        @keyframes fbfr-menu-pulse-progress {
            50% { box-shadow: 0 0 0 5px rgba(234,179,8,.24), 0 4px 9px rgba(0,0,0,.35); }
        }
        @keyframes fbfr-menu-pulse-stalled {
            50% { box-shadow: 0 0 0 6px rgba(220,38,38,.25), 0 4px 10px rgba(0,0,0,.4); }
        }
        .fbfr-menu-icon { transform: translateY(-1px); pointer-events: none; }
        #${IDS.stallBadge} {
            position: absolute;
            right: -5px;
            bottom: -6px;
            z-index: 2;
            min-width: 20px;
            height: 20px;
            padding: 0 4px;
            box-sizing: border-box;
            border: 2px solid #fff;
            border-radius: 999px;
            background: #7f1d1d;
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font: 800 10px/1 Arial, sans-serif;
            box-shadow: 0 2px 5px rgba(0,0,0,.35);
            pointer-events: none;
        }
        #${IDS.stallBadge}[hidden] { display: none !important; }
        #${IDS.menu} {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            z-index: 10001;
            width: 245px;
            padding: 7px;
            border: 1px solid #dbe4f0;
            border-radius: 9px;
            background: #fff;
            color: #0f172a;
            box-shadow: 0 12px 32px rgba(15,23,42,.24);
            font: 13px/1.35 Arial, sans-serif;
        }
        #${IDS.menu}[hidden] { display: none !important; }
        .fbfr-menu-action {
            width: 100%;
            padding: 10px 11px;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
            text-align: left;
            cursor: pointer;
        }
        .fbfr-menu-action:hover,
        .fbfr-menu-action:focus-visible { background: #eff6ff; outline: none; }
        .fbfr-menu-action:disabled { opacity: .65; cursor: progress; }
        .fbfr-menu-action-icon {
            width: 30px;
            height: 30px;
            border-radius: 7px;
            background: #e7f3ff;
            color: #1877f2;
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            font-size: 15px;
        }
        .fbfr-menu-action-copy { min-width: 0; }
        .fbfr-menu-action-title { display: block; font-weight: 700; }
        .fbfr-menu-action-subtitle {
            display: block;
            margin-top: 2px;
            color: #64748b;
            font-size: 11px;
            font-weight: 400;
        }
        .fbfr-drag-handle {
            position: absolute;
            top: -15px;
            left: -15px;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #1877f2;
            border-radius: 50%;
            background: rgba(255,255,255,.96);
            box-shadow: 0 2px 8px rgba(0,0,0,.2);
            cursor: grab;
            user-select: none;
            font-size: 15px;
            transition: transform .2s ease;
        }
        .fbfr-drag-handle:hover { transform: scale(1.15); }
        .fbfr-drag-handle:active { cursor: grabbing; }

        #${IDS.overlay} { background: rgba(0,0,0,.82); }
        #${IDS.modal} { width: min(1180px, 96vw); max-height: 92vh; }
        .fbfr-toolbar { background: #f8fafc; }
        .fbfr-actions button.fbfr-primary {
            background: #1877f2;
            border-color: #1877f2;
        }
        .fbfr-actions button.fbfr-primary:hover { background: #166fe5; }
        .fbfr-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 14px;
            padding: 18px;
        }
        .fbfr-card {
            gap: 10px;
            padding: 12px;
            border-radius: 10px;
            transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
        }
        .fbfr-card:hover {
            transform: translateY(-2px);
            border-color: #93c5fd;
            box-shadow: 0 8px 22px rgba(15,23,42,.12);
        }
        .fbfr-card-title { justify-content: space-between; }
        .fbfr-preview-wrap {
            position: relative;
            overflow: hidden;
            border-radius: 8px;
            background: #e5e7eb;
        }
        .fbfr-card img { height: 170px; border-radius: 8px; display: block; }
        .fbfr-card-download,
        .fbfr-inline-download {
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 50%;
            background: rgba(0,0,0,.72);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 15px;
            line-height: 1;
            box-shadow: 0 2px 8px rgba(0,0,0,.28);
            transition: opacity .18s ease, transform .18s ease, background .18s ease;
        }
        .fbfr-card-download {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 3;
            opacity: 0;
        }
        .fbfr-preview-wrap:hover .fbfr-card-download,
        .fbfr-card-download:focus-visible { opacity: 1; }
        .fbfr-card-download:hover,
        .fbfr-inline-download:hover {
            background: rgba(0,0,0,.92);
            transform: scale(1.1);
        }
        .fbfr-card-download[data-busy="true"],
        .fbfr-inline-download[data-busy="true"] {
            opacity: 1;
            cursor: progress;
            animation: fbfr-pulse 1s ease-in-out infinite;
        }
        .fbfr-card-download[data-success="true"],
        .fbfr-inline-download[data-success="true"] { background: rgba(5,150,105,.92); }
        @keyframes fbfr-pulse { 50% { transform: scale(.92); opacity: .72; } }

        .fbfr-inline-host { position: relative !important; }
        .fbfr-inline-download {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            opacity: 0;
        }
        .fbfr-inline-host:hover > .fbfr-inline-download,
        .fbfr-inline-download:focus-visible { opacity: 1; }

        #${IDS.toast} {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: 11000;
            transform: translate(-50%, -50%);
            min-width: 300px;
            max-width: min(560px, 88vw);
            padding: 18px 24px;
            border-radius: 10px;
            background: rgba(0,0,0,.9);
            color: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,.5);
            font: 700 14px/1.45 Arial, sans-serif;
            text-align: center;
            white-space: pre-line;
        }
        #${IDS.toast}[data-type="error"] { background: rgba(185,28,28,.94); }
        #${IDS.toast}[data-type="success"] { background: rgba(4,120,87,.94); }

        .fbfr-history-badge {
            margin-left: auto;
            padding: 2px 6px;
            border-radius: 999px;
            background: #e2e8f0;
            color: #475569;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
        }
        .fbfr-card[data-history-status="saved"] { border-color: #86efac; }
        .fbfr-card[data-history-status="saved"] .fbfr-history-badge,
        .fbfr-card[data-history-status="skipped_existing"] .fbfr-history-badge {
            background: #dcfce7;
            color: #166534;
        }
        .fbfr-card[data-history-status="failed"] { border-color: #fecaca; }
        .fbfr-card[data-history-status="failed"] .fbfr-history-badge {
            background: #fee2e2;
            color: #991b1b;
        }
        .fbfr-card[data-history-status="pending"] .fbfr-history-badge {
            background: #fef3c7;
            color: #92400e;
        }
        .fbfr-history-controls,
        .fbfr-existing-controls {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .fbfr-existing-controls label {
            color: #475569;
            font-size: 11px;
            font-weight: 700;
        }
        .fbfr-existing-policy {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            background: #fff;
            color: #0f172a;
            padding: 7px 8px;
            font: 600 12px/1.2 Arial, sans-serif;
        }


        /* v0.7.9 cleaner selector controls. */
        .fbfr-toolbar {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            gap: 10px;
            padding: 12px 16px;
        }
        .fbfr-toolbar-top,
        .fbfr-toolbar-main,
        .fbfr-settings-row {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }
        .fbfr-toolbar-top {
            justify-content: space-between;
        }
        .fbfr-status-panel {
            flex: 1 1 auto;
            min-width: 0;
            padding: 9px 11px;
            border: 1px solid #dbe4f0;
            border-radius: 8px;
            background: #fff;
        }
        .fbfr-status-panel #${IDS.status} {
            min-width: 0;
            font-size: 12px;
            font-weight: 600;
            color: #334155;
        }
        .fbfr-status-panel .fbfr-subtitle {
            margin-top: 2px;
            color: #64748b;
        }
        .fbfr-toolbar-main {
            align-items: stretch;
            flex-wrap: wrap;
        }
        .fbfr-control-group {
            display: flex;
            align-items: center;
            gap: 7px;
            min-height: 38px;
            padding: 6px 8px;
            border: 1px solid #dbe4f0;
            border-radius: 8px;
            background: #fff;
        }
        .fbfr-control-group.fbfr-grow { flex: 1 1 340px; }
        .fbfr-control-label {
            color: #64748b;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .05em;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .fbfr-segmented {
            display: inline-flex;
            align-items: center;
            gap: 0;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            overflow: hidden;
            background: #fff;
        }
        .fbfr-segmented button {
            min-height: 32px;
            padding: 6px 10px;
            border: 0;
            border-right: 1px solid #cbd5e1;
            border-radius: 0;
            background: #fff;
            color: #0f172a;
            font: 700 12px/1.2 Arial, sans-serif;
            cursor: pointer;
            white-space: nowrap;
        }
        .fbfr-segmented button:last-child { border-right: 0; }
        .fbfr-segmented button:hover { background: #eff6ff; }
        .fbfr-segmented button:disabled { opacity: .55; cursor: default; }
        .fbfr-toolbar .fbfr-primary.fbfr-start-button {
            flex: 0 0 auto;
            min-height: 42px;
            padding: 0 17px;
            border: 1px solid #1877f2;
            border-radius: 8px;
            background: #1877f2;
            color: #fff;
            font: 800 13px/1.2 Arial, sans-serif;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(24,119,242,.22);
            white-space: nowrap;
        }
        .fbfr-toolbar .fbfr-primary.fbfr-start-button:hover { background: #166fe5; }
        .fbfr-toolbar .fbfr-primary.fbfr-start-button:disabled { opacity: .65; cursor: progress; }
        .fbfr-settings-row {
            align-items: flex-start;
            padding-top: 1px;
        }
        .fbfr-settings-row .fbfr-filename-settings {
            flex: 1 1 520px;
            min-width: 300px;
            padding: 7px 9px;
            border: 1px solid #dbe4f0;
            border-radius: 8px;
            background: #fff;
        }
        .fbfr-settings-row .fbfr-filename-settings input {
            max-width: none;
        }
        .fbfr-existing-controls {
            min-height: 38px;
            padding: 5px 8px;
            border: 1px solid #dbe4f0;
            border-radius: 8px;
            background: #fff;
            flex-wrap: nowrap;
        }
        .fbfr-advanced {
            position: relative;
            flex: 0 0 auto;
        }
        .fbfr-advanced > summary {
            min-height: 38px;
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 0 11px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #fff;
            color: #334155;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            list-style: none;
            user-select: none;
            box-sizing: border-box;
        }
        .fbfr-advanced > summary::-webkit-details-marker { display: none; }
        .fbfr-advanced > summary::after {
            content: '▾';
            color: #64748b;
            font-size: 11px;
            transition: transform .15s ease;
        }
        .fbfr-advanced[open] > summary::after { transform: rotate(180deg); }
        .fbfr-advanced-panel {
            position: absolute;
            right: 0;
            top: calc(100% + 7px);
            z-index: 12;
            width: min(390px, 82vw);
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            background: #fff;
            box-shadow: 0 12px 30px rgba(15,23,42,.18);
        }
        .fbfr-advanced-panel .fbfr-fallback-option {
            width: 100%;
            box-sizing: border-box;
            line-height: 1.35;
        }
        .fbfr-advanced-panel button {
            width: 100%;
            min-height: 34px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            background: #fff;
            color: #0f172a;
            font-weight: 700;
            cursor: pointer;
        }
        .fbfr-advanced-panel button:hover { background: #eff6ff; }

        /* v0.7.10 choose-folder-first workflow. */
        .fbfr-top-actions {
            display: flex;
            align-items: stretch;
            justify-content: flex-end;
            gap: 8px;
            flex: 0 0 auto;
        }
        .fbfr-toolbar button.fbfr-folder-button,
        .fbfr-toolbar button.fbfr-recheck-button {
            min-height: 42px;
            padding: 0 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #fff;
            color: #0f172a;
            font: 800 12px/1.2 Arial, sans-serif;
            cursor: pointer;
            white-space: nowrap;
        }
        .fbfr-toolbar button.fbfr-folder-button:hover,
        .fbfr-toolbar button.fbfr-recheck-button:hover { background: #eff6ff; }
        .fbfr-toolbar button.fbfr-folder-button:disabled,
        .fbfr-toolbar button.fbfr-recheck-button:disabled { opacity: .55; cursor: default; }
        .fbfr-toolbar button.fbfr-recheck-button { padding-inline: 11px; }
        .fbfr-folder-summary {
            margin-top: 3px;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
        }
        .fbfr-folder-summary[data-state="ready"] { color: #047857; }
        .fbfr-folder-summary[data-state="working"] { color: #1d4ed8; }
        .fbfr-folder-summary[data-state="error"] { color: #b91c1c; }
        .fbfr-folder-badge {
            padding: 2px 6px;
            border-radius: 999px;
            background: #dcfce7;
            color: #166534;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
        }
        .fbfr-card[data-folder-existing="true"] {
            border-color: #86efac;
            background: #f7fff9;
        }
        .fbfr-card[data-folder-existing="true"] .fbfr-preview-wrap {
            background: #e2e8f0;
        }
        .fbfr-card[data-folder-existing="true"] img {
            filter: grayscale(.88) saturate(.55);
            opacity: .52;
            transition: filter .18s ease, opacity .18s ease;
        }
        .fbfr-existing-overlay {
            position: absolute;
            inset: 0;
            z-index: 2;
            display: none;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 5px;
            padding: 16px;
            box-sizing: border-box;
            pointer-events: none;
            text-align: center;
            color: #14532d;
            background:
                repeating-linear-gradient(
                    -45deg,
                    rgba(240,253,244,.84) 0,
                    rgba(240,253,244,.84) 10px,
                    rgba(220,252,231,.84) 10px,
                    rgba(220,252,231,.84) 20px
                );
            border: 2px solid rgba(34,197,94,.35);
            border-radius: 8px;
            backdrop-filter: blur(1px);
        }
        .fbfr-existing-overlay-icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            color: #fff;
            background: #16a34a;
            font-size: 20px;
            font-weight: 900;
            box-shadow: 0 4px 12px rgba(22,163,74,.24);
        }
        .fbfr-existing-overlay-title {
            font-size: 13px;
            font-weight: 900;
            letter-spacing: .01em;
        }
        .fbfr-existing-overlay-file {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 10px;
            font-weight: 700;
            color: #166534;
        }
        .fbfr-card[data-folder-existing="true"] .fbfr-existing-overlay {
            display: flex;
        }
        .fbfr-card[data-folder-existing="true"][data-folder-policy="uniquify"] img,
        .fbfr-card[data-folder-existing="true"][data-folder-policy="replace"] img {
            filter: grayscale(.45) saturate(.8);
            opacity: .72;
        }
        .fbfr-card[data-folder-existing="true"][data-folder-policy="uniquify"] .fbfr-existing-overlay,
        .fbfr-card[data-folder-existing="true"][data-folder-policy="replace"] .fbfr-existing-overlay {
            background: rgba(240,253,244,.66);
            border-color: rgba(34,197,94,.25);
        }
        .fbfr-card[data-folder-existing="true"][data-folder-policy="uniquify"] .fbfr-existing-overlay-title::after {
            content: ' · keep both';
            font-weight: 700;
        }
        .fbfr-card[data-folder-existing="true"][data-folder-policy="replace"] .fbfr-existing-overlay-title::after {
            content: ' · replace';
            font-weight: 700;
        }

        @media (max-width: 760px) {
            .fbfr-toolbar-top { align-items: stretch; flex-direction: column; }
            .fbfr-top-actions { width: 100%; flex-wrap: wrap; }
            .fbfr-top-actions button { flex: 1 1 auto; }
            .fbfr-toolbar .fbfr-primary.fbfr-start-button { width: 100%; }
            .fbfr-toolbar-main, .fbfr-settings-row { align-items: stretch; flex-direction: column; }
            .fbfr-control-group, .fbfr-settings-row .fbfr-filename-settings,
            .fbfr-existing-controls, .fbfr-advanced { width: 100%; box-sizing: border-box; }
            .fbfr-segmented { flex: 1 1 auto; }
            .fbfr-segmented button { flex: 1 1 0; }
            .fbfr-advanced-panel { position: static; width: 100%; margin-top: 7px; box-shadow: none; }
        }
    `);

    function getPickerWindow() {
        const candidates = [
            window,
            typeof unsafeWindow !== 'undefined' ? unsafeWindow : null
        ].filter(Boolean);
        return candidates.find(candidate => typeof candidate.showDirectoryPicker === 'function') || null;
    }

    function normalizeUrl(value) {
        if (!value) return '';
        try {
            return new URL(value, location.href).href;
        } catch (_) {
            return String(value);
        }
    }

    function isAllowedNetworkUrl(value) {
        try {
            const hostname = new URL(value, location.href).hostname.toLowerCase();
            return ['facebook.com', 'fbcdn.net', 'fbsbx.com']
                .some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
        } catch (_) {
            return false;
        }
    }

    function assertAllowedNetworkUrl(value) {
        if (!isAllowedNetworkUrl(value)) {
            throw new Error('Blocked a non-Facebook network request.');
        }
    }

    function isFacebookPageUrl(value) {
        try {
            const parsed = new URL(value, location.href);
            const hostname = parsed.hostname.toLowerCase();
            return parsed.protocol === 'https:' &&
                (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'));
        } catch (_) {
            return false;
        }
    }

    function assertFacebookPageUrl(value) {
        if (!isFacebookPageUrl(value)) {
            throw new Error('Blocked a non-Facebook photo-page URL.');
        }
    }

    function parseSizeTokens(value) {
        const result = [];
        const pattern = /(?:^|[_-])(mx|[sp])(\d+)x(\d+)(?=$|[_-])/gi;
        let match;
        while ((match = pattern.exec(String(value || '')))) {
            result.push({
                kind: match[1].toLowerCase(),
                width: Number(match[2]) || 0,
                height: Number(match[3]) || 0
            });
        }
        return result;
    }

    function descriptorScore(descriptor) {
        const value = String(descriptor || '').trim();
        if (/^\d+(?:\.\d+)?w$/i.test(value)) {
            const width = Number.parseFloat(value) || 0;
            return width * width;
        }
        if (/^\d+(?:\.\d+)?x$/i.test(value)) {
            return (Number.parseFloat(value) || 0) * 1000000;
        }
        return 0;
    }

    function getUrlRendition(url, descriptor = '') {
        const info = {
            deliveredWidth: 0,
            deliveredHeight: 0,
            deliveredKind: '',
            maxWidth: 0,
            maxHeight: 0,
            score: descriptorScore(descriptor),
            label: descriptor || 'unknown rendition'
        };

        try {
            const parsed = new URL(url, location.href);
            const deliveredTokens = [
                ...parseSizeTokens(parsed.searchParams.get('ctp')),
                ...parseSizeTokens(parsed.searchParams.get('stp'))
            ].filter(token => token.kind === 's' || token.kind === 'p');
            const maximumTokens = [
                ...parseSizeTokens(parsed.searchParams.get('cstp')),
                ...parseSizeTokens(parsed.searchParams.get('stp'))
            ].filter(token => token.kind === 'mx');

            deliveredTokens.sort((a, b) => (b.width * b.height) - (a.width * a.height));
            maximumTokens.sort((a, b) => (b.width * b.height) - (a.width * a.height));

            if (deliveredTokens[0]) {
                const delivered = deliveredTokens[0];
                info.deliveredWidth = delivered.width;
                info.deliveredHeight = delivered.height;
                info.deliveredKind = delivered.kind;
                const area = delivered.width * delivered.height;
                // Actual signed rendition dimensions outrank srcset ordering.
                info.score = Math.max(info.score, area * 100 + (delivered.kind === 's' ? 50000000 : 0));
                info.label = `${delivered.kind}${delivered.width}×${delivered.height}`;
            }

            if (maximumTokens[0]) {
                info.maxWidth = maximumTokens[0].width;
                info.maxHeight = maximumTokens[0].height;
            }
        } catch (_) {
            // Leave descriptor-only metrics in place.
        }

        return info;
    }

    function parseSrcset(srcset, sourceLabel = 'srcset') {
        return String(srcset || '')
            .split(',')
            .map(part => {
                const tokens = part.trim().split(/\s+/);
                const url = normalizeUrl(tokens.shift() || '');
                const descriptor = tokens[0] || '';
                const rendition = getUrlRendition(url, descriptor);
                return {
                    url,
                    descriptor,
                    source: `${sourceLabel}${descriptor ? ` ${descriptor}` : ''}`,
                    ...rendition
                };
            })
            .filter(candidate => candidate.url);
    }

    function addDirectCandidate(candidates, value, source) {
        const url = normalizeUrl(value);
        if (!url || !/^https?:/i.test(url)) return;
        candidates.push({
            url,
            descriptor: '',
            source,
            ...getUrlRendition(url)
        });
    }

    function collectReactCdnStrings(element) {
        const found = [];
        const roots = [];
        try {
            for (const key of Object.keys(element || {})) {
                if (/^__react(?:Props|Fiber|Container)/.test(key)) roots.push(element[key]);
            }
        } catch (_) {
            return found;
        }

        const stack = roots.map(value => ({ value, depth: 0 }));
        const seen = new WeakSet();
        let visited = 0;
        while (stack.length && visited < 450) {
            const { value, depth } = stack.pop();
            visited += 1;
            if (typeof value === 'string') {
                if (/fbcdn\.net|fbsbx\.com/i.test(value)) found.push(value);
                continue;
            }
            if (!value || typeof value !== 'object' || depth >= 5) continue;
            if (seen.has(value)) continue;
            seen.add(value);
            let entries;
            try {
                entries = Array.isArray(value)
                    ? value.slice(0, 60).map((entry, index) => [String(index), entry])
                    : Object.entries(value).slice(0, 100);
            } catch (_) {
                continue;
            }
            for (const [key, child] of entries) {
                if (/return|child|sibling|stateNode|owner/i.test(key) && depth > 1) continue;
                stack.push({ value: child, depth: depth + 1 });
            }
        }
        return found;
    }

    function extractBestImageUrl(img) {
        const candidates = [];
        const srcsetSources = [
            { value: img.getAttribute('srcset'), label: 'img srcset' },
            { value: img.getAttribute('data-srcset'), label: 'img data-srcset' }
        ];

        const picture = img.closest('picture');
        if (picture) {
            picture.querySelectorAll('source').forEach((source, index) => {
                srcsetSources.push({ value: source.getAttribute('srcset'), label: `picture source ${index + 1}` });
                srcsetSources.push({ value: source.getAttribute('data-srcset'), label: `picture data-source ${index + 1}` });
            });
        }

        for (const entry of srcsetSources) {
            if (entry.value) candidates.push(...parseSrcset(entry.value, entry.label));
        }

        addDirectCandidate(candidates, img.currentSrc, 'currentSrc');
        addDirectCandidate(candidates, img.src, 'img src');
        addDirectCandidate(candidates, img.getAttribute('src'), 'src attribute');
        addDirectCandidate(candidates, img.getAttribute('data-src'), 'data-src attribute');
        addDirectCandidate(candidates, img.dataset?.src, 'dataset src');

        for (const attr of Array.from(img.attributes || [])) {
            const value = attr.value || '';
            if (!/fbcdn\.net|fbsbx\.com/i.test(value)) continue;
            if (value.includes(',')) {
                candidates.push(...parseSrcset(value, `attribute ${attr.name}`));
            } else {
                addDirectCandidate(candidates, value, `attribute ${attr.name}`);
            }
        }

        for (const value of collectReactCdnStrings(img)) {
            if (value.includes(',')) {
                candidates.push(...parseSrcset(value, 'React image data'));
            } else {
                addDirectCandidate(candidates, value, 'React image data');
            }
        }

        const unique = new Map();
        for (const candidate of candidates) {
            const old = unique.get(candidate.url);
            if (!old || candidate.score > old.score) unique.set(candidate.url, candidate);
        }
        const ranked = Array.from(unique.values()).sort((a, b) => b.score - a.score);
        const best = ranked[0];
        const fallback = normalizeUrl(img.currentSrc || img.src || img.getAttribute('src') || '');

        return {
            fullUrl: best?.url || fallback,
            source: best?.source || 'current image source',
            resolutionScore: best?.score || Math.max(img.naturalWidth || 0, img.naturalHeight || 0),
            rendition: best || getUrlRendition(fallback),
            candidateUrls: ranked.slice(0, 20).map(candidate => candidate.url)
        };
    }

    function isFacebookImageUrl(url) {
        if (!/^https?:/i.test(url)) return false;

        try {
            const parsed = new URL(url);
            const path = parsed.pathname.toLowerCase();
            if (
                path.includes('/rsrc.php') ||
                path.includes('/emoji.php') ||
                /\.(?:svg|ico)(?:$|\?)/i.test(path)
            ) {
                return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function getRenderedSize(img) {
        const rect = img.getBoundingClientRect();
        return {
            width: Math.max(img.naturalWidth || 0, rect.width || 0, Number(img.getAttribute('width')) || 0),
            height: Math.max(img.naturalHeight || 0, rect.height || 0, Number(img.getAttribute('height')) || 0)
        };
    }

    function findPhotoLink(img) {
        let node = img.closest('a[href]');
        while (node) {
            const href = normalizeUrl(node.href);
            if (isFacebookPageUrl(href) && (
                /\/photos?\//i.test(href) ||
                /[?&]fbid=\d+/i.test(href) ||
                /[?&]set=a\./i.test(href) ||
                /\/photo\.php/i.test(href)
            )) {
                return href;
            }
            node = node.parentElement?.closest?.('a[href]') || null;
        }
        return '';
    }

    function isLikelyContentPhoto(img, fullUrl) {
        if (!isFacebookImageUrl(fullUrl)) return false;
        if (img.closest(`#${IDS.overlay}, nav, [role="navigation"], [role="banner"]`)) return false;

        const { width, height } = getRenderedSize(img);
        const photoLink = findPhotoLink(img);
        const largestSide = Math.max(width, height);

        // A specific Facebook photo link is the strongest signal. Keep it even
        // when the currently rendered thumbnail is small.
        if (photoLink) return true;
        if (width < SETTINGS.minimumRenderedSide && height < SETTINGS.minimumRenderedSide) return false;

        const alt = String(img.alt || img.getAttribute('aria-label') || '').toLowerCase();
        if (/emoji|icon|logo|sticker|reaction/.test(alt) && largestSide < 420) return false;
        if (/profile picture|avatar/.test(alt) && largestSide < 420) return false;

        return true;
    }

    function extractPhotoId(value) {
        if (!value) return '';

        const keyMatch = String(value).match(/(?:photo:|fbid=)(\d{5,})/i);
        if (keyMatch?.[1]) return keyMatch[1];

        try {
            const parsed = new URL(value, location.href);
            const queryId = parsed.searchParams.get('fbid') || parsed.searchParams.get('story_fbid');
            if (queryId && /^\d+$/.test(queryId)) return queryId;
            return parsed.pathname.match(/\/(?:photos?|photo)\/(?:[^/]+\/)?(\d{5,})(?:\/|$)/i)?.[1] || '';
        } catch (_) {
            return '';
        }
    }

    function canonicalSourceKey(sourceUrl) {
        if (!sourceUrl) return '';
        try {
            const parsed = new URL(sourceUrl, location.href);
            const photoId = extractPhotoId(parsed.href);
            if (photoId) return `photo:${photoId}`;

            // Preserve the actual photo/album item link, but remove common
            // tracking parameters that create false duplicates.
            const kept = new URLSearchParams();
            for (const name of ['set', 'type', 'theater', 'id', 'story_fbid']) {
                const value = parsed.searchParams.get(name);
                if (value) kept.set(name, value);
            }
            const query = kept.toString();
            return `link:${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`.toLowerCase();
        } catch (_) {
            return `link:${String(sourceUrl)}`.toLowerCase();
        }
    }

    function imageKey(fullUrl, sourceUrl) {
        const sourceKey = canonicalSourceKey(sourceUrl);
        if (sourceKey) return sourceKey;

        try {
            const parsed = new URL(fullUrl);
            // Facebook CDN resize variants normally share a path. This combines
            // thumbnail/full-size variants while preserving distinct photos.
            return `image:${parsed.hostname}${parsed.pathname}`.toLowerCase();
        } catch (_) {
            return `image:${String(fullUrl).split('?')[0]}`.toLowerCase();
        }
    }

    function cleanDescription(value) {
        const text = String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return '';
        return text.length > 110 ? `${text.slice(0, 109).trim()}…` : text;
    }

    function captureImageElement(img, imageMap) {
        if (!(img instanceof HTMLImageElement)) return { added: 0, upgraded: 0 };

        const extracted = extractBestImageUrl(img);
        if (!extracted.fullUrl || !isLikelyContentPhoto(img, extracted.fullUrl)) {
            return { added: 0, upgraded: 0 };
        }

        const sourceUrl = findPhotoLink(img);
        const key = imageKey(extracted.fullUrl, sourceUrl);
        const size = getRenderedSize(img);
        const item = {
            key,
            fullUrl: extracted.fullUrl,
            thumbnailUrl: normalizeUrl(img.currentSrc || img.src || extracted.fullUrl),
            sourceUrl,
            source: extracted.source,
            resolutionScore: extracted.resolutionScore,
            rendition: extracted.rendition,
            candidateUrls: extracted.candidateUrls,
            width: Math.round(size.width),
            height: Math.round(size.height),
            description: cleanDescription(img.alt || img.getAttribute('aria-label') || '')
        };

        const existing = imageMap.get(key);
        if (!existing) {
            imageMap.set(key, item);
            return { added: 1, upgraded: 0 };
        }

        if (
            item.resolutionScore > existing.resolutionScore ||
            (item.source.startsWith('srcset') && !existing.source.startsWith('srcset'))
        ) {
            imageMap.set(key, {
                ...existing,
                ...item,
                description: item.description || existing.description,
                sourceUrl: item.sourceUrl || existing.sourceUrl,
                candidateUrls: Array.from(new Set([...(item.candidateUrls || []), ...(existing.candidateUrls || [])])).slice(0, 30)
            });
            return { added: 0, upgraded: 1 };
        }

        return { added: 0, upgraded: 0 };
    }

    function captureVisibleImages(imageMap, root = document) {
        let added = 0;
        let upgraded = 0;
        const images = [];

        if (root instanceof HTMLImageElement) images.push(root);
        if (root?.querySelectorAll) images.push(...root.querySelectorAll('img'));

        for (const img of images) {
            const result = captureImageElement(img, imageMap);
            added += result.added;
            upgraded += result.upgraded;
        }

        return { added, upgraded };
    }

    function createLiveCaptureObserver(imageMap) {
        return new MutationObserver(mutations => {
            let changed = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    const result = captureImageElement(mutation.target, imageMap);
                    changed ||= Boolean(result.added || result.upgraded);
                    continue;
                }

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    const result = captureVisibleImages(imageMap, node);
                    changed ||= Boolean(result.added || result.upgraded);
                }
            }
            if (changed) persistRetainedImages();
        });
    }

    function persistRetainedImages() {
        try {
            retainedProfileKey ||= currentRetentionProfileKey();
            sessionStorage.setItem(SETTINGS.sessionKey, JSON.stringify({
                version: 2,
                profileKey: retainedProfileKey,
                items: Array.from(retainedImages.values())
            }));
        } catch (error) {
            console.warn('Could not persist retained Facebook image list:', error);
        }
    }

    function loadRetainedImages() {
        try {
            const raw = sessionStorage.getItem(SETTINGS.sessionKey);
            retainedProfileKey = currentRetentionProfileKey();
            if (!raw) return;

            const parsed = JSON.parse(raw);
            // Older manifests did not record which profile supplied their
            // images, so they cannot be restored without risking cross-profile
            // contamination.
            if (Array.isArray(parsed)) {
                sessionStorage.removeItem(SETTINGS.sessionKey);
                return;
            }

            const storedProfileKey = String(parsed?.profileKey || '');
            if (retainedProfileKey && storedProfileKey !== retainedProfileKey) {
                sessionStorage.removeItem(SETTINGS.sessionKey);
                return;
            }

            retainedProfileKey = storedProfileKey || retainedProfileKey;
            const items = Array.isArray(parsed?.items) ? parsed.items : [];
            for (const item of items) {
                if (item?.key && item?.fullUrl) retainedImages.set(item.key, item);
            }
        } catch (error) {
            console.warn('Could not restore retained Facebook image list:', error);
        }
    }

    function clearRetainedImages() {
        retainedImages.clear();
        try { sessionStorage.removeItem(SETTINGS.sessionKey); } catch (_) { /* ignore */ }
        updateMainButtonIdle();
    }

    function currentRetentionProfileKey() {
        const profileRoute = currentProfileRoute();
        if (!profileRoute?.type || !profileRoute?.value) return '';
        return `${profileRoute.type}:${String(profileRoute.value).toLowerCase()}`;
    }

    function ensureRetainedProfileScope() {
        const nextProfileKey = currentRetentionProfileKey();
        // Photo viewers and other routes do not identify their owning profile
        // reliably. Keep the current scope until a definite profile appears.
        if (!nextProfileKey) return false;
        if (!retainedProfileKey) {
            retainedProfileKey = nextProfileKey;
            return false;
        }
        if (retainedProfileKey === nextProfileKey) return false;

        retainedProfileKey = nextProfileKey;
        retainedImages.clear();
        try { sessionStorage.removeItem(SETTINGS.sessionKey); } catch (_) { /* ignore */ }
        return true;
    }

    function loadDownloadHistory() {
        try {
            const stored = GM_getValue(SETTINGS.historyKey, null);
            if (!stored || typeof stored !== 'object') return {};
            const items = stored.items && typeof stored.items === 'object' ? stored.items : stored;
            return { ...items };
        } catch (error) {
            console.warn('Could not load download history:', error);
            return {};
        }
    }

    function persistDownloadHistory() {
        try {
            const entries = Object.entries(downloadHistory)
                .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))
                .slice(0, SETTINGS.historyLimit);
            downloadHistory = Object.fromEntries(entries);
            GM_setValue(SETTINGS.historyKey, {
                version: 1,
                updatedAt: Date.now(),
                items: downloadHistory
            });
        } catch (error) {
            console.warn('Could not save download history:', error);
        }
    }

    function clearDownloadHistory() {
        downloadHistory = {};
        try { GM_deleteValue(SETTINGS.historyKey); } catch (_) { /* ignore */ }
    }

    function historyIdForItem(item) {
        const photoId = facebookPhotoId(item);
        if (photoId) return `photo:${photoId}`;
        const stableSeed = item?.key || item?.sourceUrl || item?.fullUrl || '';
        return stableSeed ? `item:${stableNumericCode(stableSeed)}` : '';
    }

    function historyForItem(item) {
        const id = historyIdForItem(item);
        return id ? downloadHistory[id] || null : null;
    }

    function updateDownloadHistory(item, status, details = {}) {
        const id = historyIdForItem(item);
        if (!id) return;
        const previous = downloadHistory[id] || {};
        const next = {
            status,
            filename: details.filename || previous.filename || '',
            width: Number(details.width || previous.width || 0),
            height: Number(details.height || previous.height || 0),
            error: status === 'failed' ? 'Failed' : '',
            updatedAt: Date.now()
        };
        downloadHistory[id] = next;
        persistDownloadHistory();
    }

    function isCompletedHistoryStatus(status) {
        return status === 'saved' || status === 'skipped_existing';
    }

    function historyLabel(record) {
        if (!record) return '';
        if (record.status === 'saved') return 'Saved';
        if (record.status === 'skipped_existing') return 'Already exists';
        if (record.status === 'failed') return 'Failed';
        if (record.status === 'pending') return 'Pending';
        return '';
    }

    function applyHistoryToCard(card, item, initial = false) {
        if (!card || !item) return;
        const record = historyForItem(item);
        const status = record?.status || '';
        card.dataset.historyStatus = status;
        const badge = card.querySelector('.fbfr-history-badge');
        if (badge) {
            badge.textContent = historyLabel(record);
            badge.hidden = !record;
            badge.title = record?.filename || (record?.status === 'failed' ? 'Previous attempt failed' : '');
        }
        const checkbox = card.querySelector('input[type="checkbox"]');
        // History remains visible, but the chosen folder is the authority for
        // automatic deselection. This allows the same scan to be downloaded
        // into a different folder without stale history hiding files.
        if (initial && record) {
            const detail = [record.filename, record.width && record.height ? `${record.width}×${record.height}` : '']
                .filter(Boolean)
                .join(' · ');
            if (record.status === 'saved') {
                setCardResolutionState(card, `Previously saved${detail ? `: ${detail}` : '.'}`, 'success');
            } else if (record.status === 'skipped_existing') {
                setCardResolutionState(card, `Previously skipped because the file already existed${detail ? `: ${detail}` : '.'}`, 'success');
            } else if (record.status === 'failed') {
                setCardResolutionState(card, 'Previous attempt failed. Use Retry failed to try it again.', 'error');
            } else if (record.status === 'pending') {
                setCardResolutionState(card, 'Previous run stopped while this image was pending. It is selected for resume.', 'working');
            }
        }
    }

    function historyStats(images) {
        const stats = { saved: 0, skipped: 0, failed: 0, pending: 0, remaining: 0 };
        for (const item of images || []) {
            const status = historyForItem(item)?.status || '';
            if (status === 'saved') stats.saved += 1;
            else if (status === 'skipped_existing') stats.skipped += 1;
            else if (status === 'failed') stats.failed += 1;
            else if (status === 'pending') stats.pending += 1;
            if (!isCompletedHistoryStatus(status)) stats.remaining += 1;
        }
        return stats;
    }

    function refreshHistoryUi(modal) {
        if (!modal?._fbfrImages) return;
        modal.querySelectorAll('.fbfr-card').forEach(card => {
            const index = Number(card.dataset.index);
            const item = Number.isInteger(index) ? modal._fbfrImages[index] : null;
            if (item) applyHistoryToCard(card, item, false);
        });
        const stats = historyStats(modal._fbfrImages);
        if (modal._fbfrResumeButton) {
            modal._fbfrResumeButton.textContent = `Resume ${stats.remaining} remaining`;
            modal._fbfrResumeButton.disabled = stats.remaining === 0 || downloading;
        }
        if (modal._fbfrRetryButton) {
            modal._fbfrRetryButton.textContent = `Retry ${stats.failed} failed`;
            modal._fbfrRetryButton.disabled = stats.failed === 0 || downloading;
        }
        if (modal._fbfrHistorySummary) {
            modal._fbfrHistorySummary.textContent = `History: ${stats.saved} saved · ${stats.skipped} existing · ${stats.failed} failed · ${stats.remaining} remaining`;
        }
        updateDownloadActionState(modal);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showToast(message, type = 'normal', duration = 3200) {
        document.getElementById(IDS.toast)?.remove();
        const toast = document.createElement('div');
        toast.id = IDS.toast;
        toast.dataset.type = type;
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), duration);
        return toast;
    }

    function downloadWithTampermonkey(url, filename) {
        assertAllowedNetworkUrl(url);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = callback => value => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            const done = finish(resolve);
            const fail = finish(error => reject(new Error(error?.error || error?.message || String(error || 'Download failed'))));

            try {
                const result = GM_download({
                    url,
                    name: filename,
                    saveAs: false,
                    conflictAction: 'uniquify',
                    onload: done,
                    onerror: fail,
                    ontimeout: () => fail(new Error('Download timed out'))
                });
                if (result && typeof result.then === 'function') result.then(done, fail);
            } catch (error) {
                fail(error);
            }
        });
    }

    async function resolveVerifiedBackgroundAsset(item) {
        const signedUrl = await resolveSignedLargeUrl(item, true);
        const candidate = {
            url: signedUrl,
            candidateUrls: Array.from(new Set([
                signedUrl,
                ...(item.candidateUrls || []),
                item.fullUrl
            ].filter(Boolean)))
        };
        const asset = await fetchLargestWorkingAsset(candidate);
        if (
            Math.max(asset.dimensions.width, asset.dimensions.height) < SETTINGS.minimumSavedSide ||
            !downloadedImageLooksLargeEnough(asset.url, asset.dimensions)
        ) {
            throw new Error(`Facebook only exposed ${asset.dimensions.width}×${asset.dimensions.height}, which still looks like a preview.`);
        }

        item.fullUrl = asset.url;
        item.source = 'background photo-page request';
        item.resolutionScore = asset.dimensions.width * asset.dimensions.height;
        item.candidateUrls = Array.from(new Set([asset.url, ...(item.candidateUrls || [])])).slice(0, 40);
        retainedImages.set(item.key, item);
        persistRetainedImages();
        return asset;
    }

    function itemFromImageElement(img) {
        const map = new Map();
        captureImageElement(img, map);
        return map.values().next().value || null;
    }

    async function downloadSingleMaximum(item, control, card = null, preview = null) {
        if (!item?.sourceUrl) {
            showToast('This image does not expose a Facebook photo permalink, so its verified full-size file cannot be resolved.', 'error', 4200);
            return;
        }
        if (control?.dataset.busy === 'true') return;

        const oldText = control?.textContent || '💾';
        if (control) {
            control.dataset.busy = 'true';
            control.dataset.success = 'false';
            control.textContent = '…';
        }
        setCardResolutionState(card, 'Resolving the verified maximum-resolution image…', 'working');
        showToast('Resolving the maximum-resolution Facebook image…');

        try {
            const asset = await resolveVerifiedBackgroundAsset(item);
            const prefix = detectAccountName([item]);
            const base = filenameBase(item, 1, 1, prefix);
            const extension = extensionForContentType(asset.fetched.contentType, asset.url);
            const filename = `${base}.${extension}`;

            if (preview) {
                preview.src = asset.url;
                preview.dataset.fullResolution = 'true';
            }
            setCardResolutionState(card, `Verified full image: ${asset.dimensions.width}×${asset.dimensions.height} · downloading ${filename}`, 'success');
            await downloadWithTampermonkey(asset.url, filename);

            if (control) {
                control.dataset.success = 'true';
                control.textContent = '✓';
            }
            setCardResolutionState(card, `Verified full image: ${asset.dimensions.width}×${asset.dimensions.height} · downloaded ${filename}`, 'success');
            showToast(`Image downloaded at ${asset.dimensions.width}×${asset.dimensions.height}\n${filename}`, 'success', 3500);
        } catch (error) {
            setCardResolutionState(card, `Individual download failed: ${error?.message || error}`, 'error');
            showToast(`Individual full-resolution download failed\n${error?.message || error}`, 'error', 5000);
            if (control) control.textContent = '!';
            console.error('Individual maximum-resolution download failed:', error, item);
        } finally {
            if (control) {
                control.dataset.busy = 'false';
                window.setTimeout(() => {
                    control.dataset.success = 'false';
                    control.textContent = oldText;
                }, 1800);
            }
        }
    }

    function addInlineDownloadIcon(img) {
        if (!(img instanceof HTMLImageElement) || inlineProcessedImages.has(img)) return false;
        if (img.closest(`#${IDS.overlay}, #${IDS.container}, nav, [role="navigation"], [role="banner"]`)) {
            inlineProcessedImages.add(img);
            return false;
        }

        const item = itemFromImageElement(img);
        if (!item?.sourceUrl) {
            // Facebook frequently inserts an empty img before assigning its
            // lazy src/srcset. Leave it eligible so the attribute observer can
            // retry it when the real photo source arrives.
            return false;
        }

        const host = img.closest('a[href]') || img.parentElement;
        if (!(host instanceof HTMLElement) || !host.contains(img)) {
            // Reparented virtual-grid images may gain a valid host later.
            return false;
        }
        if (host.querySelector(':scope > .fbfr-inline-download')) {
            inlineProcessedImages.add(img);
            return false;
        }

        host.classList.add('fbfr-inline-host');
        const icon = document.createElement('div');
        icon.className = 'fbfr-inline-download';
        icon.textContent = '💾';
        icon.title = 'Download this image at the largest verified resolution';
        icon.setAttribute('role', 'button');
        icon.setAttribute('tabindex', '0');
        icon.setAttribute('aria-label', icon.title);

        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const currentItem = itemFromImageElement(img) || item;
            void downloadSingleMaximum(currentItem, icon);
        };
        icon.addEventListener('click', activate);
        icon.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        host.appendChild(icon);
        inlineProcessedImages.add(img);
        return true;
    }

    function scanForInlineDownloadIcons(root = document) {
        const images = [];
        if (root instanceof HTMLImageElement) images.push(root);
        if (root?.querySelectorAll) images.push(...root.querySelectorAll('img'));
        for (const img of images) addInlineDownloadIcon(img);
    }

    function startInlineDownloadMonitoring() {
        scanForInlineDownloadIcons();
        const pendingRoots = new Set();
        const flushPendingRoots = () => {
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();
            for (const root of roots) scanForInlineDownloadIcons(root);
        };
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
                    pendingRoots.add(mutation.target);
                }
                for (const node of mutation.addedNodes || []) {
                    if (node instanceof Element) pendingRoots.add(node);
                }
            }
            window.clearTimeout(inlineScanTimer);
            inlineScanTimer = window.setTimeout(flushPendingRoots, 400);
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset']
        });
    }

    function setMainButton(text, disabled = false, scanState = scanning ? 'progress' : 'idle', stallCount = 0) {
        const button = document.getElementById(IDS.button);
        const stallBadge = document.getElementById(IDS.stallBadge);
        const scanAction = document.getElementById(IDS.scanAction);
        const safeState = ['idle', 'progress', 'stalled'].includes(scanState) ? scanState : 'idle';
        const safeStallCount = safeState === 'stalled'
            ? Math.min(SETTINGS.settleRounds, Math.max(1, Number(stallCount) || 1))
            : 0;
        if (button) {
            button.disabled = Boolean(disabled);
            button.dataset.scanState = safeState;
            if (safeState === 'stalled') {
                button.title = `Bottom check ${safeStallCount}/${SETTINGS.settleRounds}. Scan is still running but Facebook has not changed the page: ${text}`;
            } else if (safeState === 'progress') {
                button.title = `Image scan in progress: ${text}`;
            } else {
                button.title = 'Open Facebook image downloader menu';
            }
        }
        if (stallBadge) {
            stallBadge.hidden = safeState !== 'stalled';
            stallBadge.textContent = safeState === 'stalled' ? String(safeStallCount) : '';
            stallBadge.setAttribute('aria-label', safeState === 'stalled'
                ? `Bottom stability check ${safeStallCount} of ${SETTINGS.settleRounds}`
                : '');
        }
        if (!scanAction) return;
        const title = scanAction.querySelector('.fbfr-menu-action-title');
        const subtitle = scanAction.querySelector('.fbfr-menu-action-subtitle');
        if (title) title.textContent = text;
        if (subtitle) {
            if (safeState === 'stalled') {
                subtitle.textContent = 'No page changes yet. The bottom check is still running; avoid scrolling or navigating.';
            } else if (safeState === 'progress') {
                subtitle.textContent = 'Scanning is active. Click again only if you want to stop and use the images found so far.';
            } else {
                subtitle.textContent = 'Deep-scan the current page, then open the image selector.';
            }
        }
        scanAction.disabled = Boolean(disabled);
    }

    function updateMainButtonIdle() {
        const retainedText = retainedImages.size ? ` · ${retainedImages.size} retained` : '';
        setMainButton(`Scan images${retainedText}`, false);
    }

    async function scanPage({ clearFirst = false } = {}) {
        if (downloading) return;
        if (scanning) {
            stopScanRequested = true;
            setMainButton(`Stopping scan… ${retainedImages.size} retained`, false, 'progress');
            return;
        }

        ensureRetainedProfileScope();

        scanning = true;
        stopScanRequested = false;
        setMainButton(`Starting scan… ${retainedImages.size} retained`, false, 'progress');
        if (clearFirst) clearRetainedImages();
        document.getElementById(IDS.overlay)?.remove();

        const originalScrollY = window.scrollY;
        let stableBottomRounds = 0;
        let lastBottomCount = -1;
        let lastBottomHeight = -1;
        let observer;

        try {
            // Start at the top so virtualised album tiles are seen in order.
            window.scrollTo({ top: 0, behavior: 'auto' });
            await sleep(SETTINGS.initialDelayMs);
            // Capture the filename prefix while the profile header is definitely
            // on screen. Facebook may virtualise that header out of the DOM by
            // the time a long scan reaches the bottom.
            detectAccountName();
            captureVisibleImages(retainedImages);

            observer = createLiveCaptureObserver(retainedImages);
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset']
            });

            for (let round = 1; round <= SETTINGS.maxRounds; round += 1) {
                if (stopScanRequested) break;

                const before = captureVisibleImages(retainedImages);
                persistRetainedImages();

                const viewport = Math.max(window.innerHeight || 0, 700);
                const heightBefore = Math.max(
                    document.documentElement.scrollHeight,
                    document.body?.scrollHeight || 0
                );
                const topBefore = window.scrollY;
                const nearBottom = topBefore + viewport >= heightBefore - Math.max(160, viewport * 0.15);

                const scanState = nearBottom && stableBottomRounds > 0 ? 'stalled' : 'progress';
                const scanLabel = scanState === 'stalled'
                    ? `Still scanning · no change ${stableBottomRounds}/${SETTINGS.settleRounds} · ${retainedImages.size} found`
                    : `Stop scan · ${retainedImages.size} found · ${round}/${SETTINGS.maxRounds}`;
                setMainButton(scanLabel, false, scanState, stableBottomRounds);

                console.info(
                    `Facebook deep scan round ${round}/${SETTINGS.maxRounds}:`,
                    `${retainedImages.size} retained, ${before.added} new, ${before.upgraded} upgraded,`,
                    nearBottom ? `bottom probe ${stableBottomRounds}/${SETTINGS.settleRounds}` : 'moving through page'
                );

                if (!nearBottom) {
                    const nextTop = Math.min(
                        heightBefore,
                        topBefore + Math.max(650, Math.floor(viewport * SETTINGS.scrollStepRatio))
                    );
                    window.scrollTo({ top: nextTop, behavior: 'auto' });
                    await sleep(SETTINGS.scrollDelayMs);
                    stableBottomRounds = 0;
                    continue;
                }

                // At the bottom, keep probing for lazy-loaded batches. The scan
                // only ends when both the retained count and page height remain
                // unchanged for several consecutive, slower probes.
                window.scrollTo({ top: heightBefore, behavior: 'auto' });
                await sleep(SETTINGS.bottomDelayMs);
                const after = captureVisibleImages(retainedImages);
                persistRetainedImages();

                const heightAfter = Math.max(
                    document.documentElement.scrollHeight,
                    document.body?.scrollHeight || 0
                );
                const countAfter = retainedImages.size;
                const progressed =
                    countAfter !== lastBottomCount ||
                    heightAfter !== lastBottomHeight ||
                    after.added > 0 ||
                    after.upgraded > 0;

                if (progressed) {
                    stableBottomRounds = 0;
                    setMainButton(
                        `Stop scan · ${retainedImages.size} found · ${round}/${SETTINGS.maxRounds}`,
                        false,
                        'progress'
                    );
                } else {
                    stableBottomRounds += 1;
                    setMainButton(
                        `Still scanning · no change ${stableBottomRounds}/${SETTINGS.settleRounds} · ${retainedImages.size} found`,
                        false,
                        'stalled',
                        stableBottomRounds
                    );
                }

                lastBottomCount = countAfter;
                lastBottomHeight = heightAfter;
                if (stableBottomRounds >= SETTINGS.settleRounds) break;
            }

            captureVisibleImages(retainedImages);
            persistRetainedImages();

            const images = Array.from(retainedImages.values());
            if (!images.length) {
                alert('No downloadable Facebook images were found on this page.');
                return;
            }

            renderModal(images, {
                stoppedManually: stopScanRequested,
                reachedLimit: !stopScanRequested && stableBottomRounds < SETTINGS.settleRounds
            });
        } catch (error) {
            console.error('Facebook deep scan failed:', error);
            alert(`Image scan failed: ${error?.message || error}`);
        } finally {
            observer?.disconnect();
            window.scrollTo({ top: originalScrollY, behavior: 'auto' });
            scanning = false;
            stopScanRequested = false;
            updateMainButtonIdle();
        }
    }

    function sanitizeFilenamePart(value) {
        return String(value || '')
            .replace(/[<>:"/\\|?*\x00-\x1f\x7f-\x9f]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[.\s-]+$/g, '')
            .trim();
    }

    const GENERIC_FACEBOOK_ACCOUNT_LABELS = new Set([
        'about', 'account', 'accounts', 'all photos', 'albums', 'chat', 'chats', 'check-ins', 'checkins',
        'add friend', 'create story', 'events', 'facebook', 'feeds', 'follow', 'friends', 'gaming',
        'groups', 'home', 'like', 'log in', 'marketplace', 'menu', 'message', 'messages',
        'messenger', 'more', 'notifications', 'photos', 'posts', 'profile',
        'reels', 'search', 'settings', 'stories', 'videos', 'watch', 'your profile'
    ]);

    function cleanAccountNameCandidate(value) {
        let text = String(value || '')
            .replace(/\s*[|·-]\s*Facebook\s*$/i, '')
            .replace(/^Facebook\s*[|·-]\s*/i, '')
            .replace(/^Photos\s+of\s+/i, '')
            .replace(/['’]s\s+(?:Photos|Albums|Videos|Reels|Check-?ins|Check Ins).*$/i, '')
            .replace(/\s+-\s+(?:Photos|Albums|Videos|Reels|Check-?ins|Check Ins).*$/i, '')
            .replace(/^(?:Photos|Albums|Videos|Reels|Check-?ins|Check Ins)$/i, '')
            .replace(/\s+(?:Photos|Albums|Videos|Reels|Check-?ins|Check Ins)\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        text = sanitizeFilenamePart(text);
        const normalized = text.toLowerCase();
        if (!text || text.length > 70) return '';
        if (GENERIC_FACEBOOK_ACCOUNT_LABELS.has(normalized)) return '';
        if (/^(?:chat|chats|messages|notifications)(?:\s*\(.*\)|\s*\d+)?$/i.test(text)) return '';
        if (/^(?:facebook|meta)\b/i.test(text)) return '';

        // Facebook places counts directly below the account name. They are UI
        // metadata, never valid filename prefixes.
        if (/^[\d.,]+\s*[KMB]?\s+(?:friends?|followers?|following|likes?|posts?|photos?|check-?ins?)(?:\s*[·|,]\s*[\d.,]+\s*[KMB]?\s+(?:friends?|followers?|following|likes?|posts?|photos?|check-?ins?))*$/i.test(text)) {
            return '';
        }
        if (/\b(?:friends?|followers?|following)\b/i.test(text) && /^[\d\s.,KMB·|+-]+(?:friends?|followers?|following)/i.test(text)) {
            return '';
        }
        return text;
    }

    function currentProfileRoute() {
        try {
            const parsed = new URL(location.href);
            const segments = parsed.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
            const first = String(segments[0] || '').toLowerCase();
            const reserved = new Set([
                'bookmarks', 'events', 'friends', 'gaming', 'groups', 'help', 'home.php',
                'marketplace', 'messages', 'notifications', 'photo.php', 'photos',
                'reel', 'reels', 'search', 'settings', 'share', 'stories', 'watch'
            ]);

            if (first === 'profile.php') {
                const id = parsed.searchParams.get('id');
                return id ? { type: 'id', value: id } : null;
            }

            if (first === 'people' && segments.length >= 3) {
                return { type: 'path', value: `/${segments.slice(0, 3).join('/')}`, fallback: segments[1] };
            }

            if (segments[0] && !reserved.has(first)) {
                return { type: 'path', value: `/${segments[0]}`, fallback: segments[0] };
            }
        } catch (_) {
            // Fall through to DOM-only detection.
        }
        return null;
    }

    function anchorMatchesCurrentProfile(anchor, profileRoute) {
        if (!(anchor instanceof HTMLAnchorElement) || !profileRoute) return false;
        try {
            const parsed = new URL(anchor.href, location.href);
            if (!/^(?:www\.|m\.)?facebook\.com$/i.test(parsed.hostname)) return false;
            if (profileRoute.type === 'id') {
                return parsed.pathname.toLowerCase() === '/profile.php' && parsed.searchParams.get('id') === profileRoute.value;
            }
            const anchorPath = parsed.pathname.replace(/\/+$/, '') || '/';
            const profilePath = profileRoute.value.replace(/\/+$/, '') || '/';
            return anchorPath === profilePath;
        } catch (_) {
            return false;
        }
    }

    function visibleElement(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function directElementText(element) {
        if (!(element instanceof Element)) return '';
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => String(node.nodeValue || '').replace(/ /g, ' '))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function accountNameTextFromElement(element) {
        if (!(element instanceof Element)) return '';
        // Facebook currently renders some profile names as a focusable role=button
        // div whose name is a direct text node followed by empty decorative children.
        // Prefer that direct text so descendant hover/visual-completion nodes cannot
        // contaminate the filename prefix.
        const direct = directElementText(element);
        return direct || String(element.textContent || '').replace(/ /g, ' ').trim();
    }

    function profileRouteCacheKey(profileRoute = currentProfileRoute()) {
        if (profileRoute?.type && profileRoute?.value) {
            return `${profileRoute.type}:${profileRoute.value}`;
        }
        try {
            const parsed = new URL(location.href);
            return `url:${parsed.pathname.replace(/\/+$/, '') || '/'}:${parsed.searchParams.get('id') || ''}`;
        } catch (_) {
            return `url:${location.pathname || '/'}`;
        }
    }

    function cacheAccountName(value, profileRoute = currentProfileRoute()) {
        const cleaned = cleanAccountNameCandidate(value);
        if (!cleaned) return '';
        accountNameCache = {
            routeKey: profileRouteCacheKey(profileRoute),
            value: cleaned
        };
        return cleaned;
    }

    function profileHeaderNameCandidates(profileRoute) {
        const candidates = [];
        const seen = new Set();
        const push = (value, source, element = null, score = 0) => {
            const cleaned = cleanAccountNameCandidate(value);
            if (!cleaned) return;
            const key = cleaned.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            candidates.push({ value: cleaned, source, element, score });
        };

        // Newer Facebook profile layouts sometimes render the visible account
        // name as a focusable role=button div rather than an h1. Its useful name
        // is a direct text node; the child span/div nodes are decorative. Class
        // names are intentionally not used because Facebook rotates them.
        for (const element of document.querySelectorAll(
            '[role="main"] div[role="button"][tabindex="0"], main div[role="button"][tabindex="0"]'
        )) {
            if (!visibleElement(element)) continue;
            const value = directElementText(element);
            if (!value) continue;
            const rect = element.getBoundingClientRect();
            if (rect.height > 110 || rect.width > Math.max(760, window.innerWidth * 0.75)) continue;
            const style = getComputedStyle(element);
            const fontSize = Number.parseFloat(style.fontSize) || 0;
            let score = 72;
            if (element.closest('[role="main"], main')) score += 22;
            if (element.closest('h1, h2, [role="heading"]')) score += 35;
            if (fontSize >= 28) score += 75;
            else if (fontSize >= 22) score += 52;
            else if (fontSize >= 18) score += 24;
            if (Array.from(element.children).every(child => !String(child.textContent || '').trim())) score += 16;
            push(value, 'direct-text profile name button', element, score);
        }

        // Restore the source that worked in v0.7.4/v0.7.5: Facebook's visible
        // profile-name H1. Restrict it to the main content before trying any
        // metadata or nearby labels.
        for (const selector of [
            '[role="main"] h1',
            'main h1',
            '[role="main"] [role="heading"][aria-level="1"]',
            '[role="main"] h2',
            'h1'
        ]) {
            for (const element of document.querySelectorAll(selector)) {
                if (!visibleElement(element)) continue;
                let score = 100;
                if (selector.includes('h1')) score += 35;
                if (element.closest('[role="main"], main')) score += 25;
                if (element.querySelector('a[href]')) score += 8;
                push(accountNameTextFromElement(element), `profile heading: ${selector}`, element, score);
            }
        }

        // Exact links to the current profile root are strong evidence, but tab
        // links such as /check_ins and /photos are deliberately excluded.
        if (profileRoute) {
            for (const anchor of document.querySelectorAll('a[href]')) {
                if (!anchorMatchesCurrentProfile(anchor, profileRoute) || !visibleElement(anchor)) continue;
                let score = 80;
                if (anchor.closest('[role="main"], main')) score += 25;
                if (anchor.closest('h1, h2, [role="heading"]')) score += 30;
                push(accountNameTextFromElement(anchor), 'exact profile-root link', anchor, score);
                push(anchor.getAttribute('aria-label'), 'exact profile-root aria-label', anchor, score - 5);
            }
        }

        // Facebook commonly renders the account name immediately above a
        // friends/followers line. Use geometry to find the closest valid text
        // above that count, while still rejecting the count itself.
        const countPattern = /^[\d.,]+\s*[KMB]?\s+(?:friends?|followers?|following|likes?)(?:\b|\s*[·|,])/i;
        const textElements = Array.from(document.querySelectorAll('[role="main"] span, [role="main"] a, [role="main"] h1, [role="main"] h2, main span, main a, main h1, main h2'));
        for (const countElement of textElements) {
            const countText = String(countElement.textContent || '').trim();
            if (!countPattern.test(countText) || !visibleElement(countElement)) continue;
            const countRect = countElement.getBoundingClientRect();
            const scope = countElement.closest('header, section, [role="main"], main') || document;
            for (const candidateElement of scope.querySelectorAll('h1, h2, [role="heading"], a[href], span[dir="auto"], div[role="button"][tabindex="0"]')) {
                if (candidateElement === countElement || !visibleElement(candidateElement)) continue;
                const rect = candidateElement.getBoundingClientRect();
                const verticalGap = countRect.top - rect.bottom;
                if (verticalGap < -4 || verticalGap > 180) continue;
                if (Math.abs(rect.left - countRect.left) > Math.max(260, countRect.width * 1.5)) continue;
                const style = getComputedStyle(candidateElement);
                const fontSize = Number.parseFloat(style.fontSize) || 0;
                const score = 120 - Math.min(100, verticalGap)
                    + (candidateElement.matches('h1, [aria-level="1"]') ? 35 : 0)
                    + (candidateElement.matches('div[role="button"][tabindex="0"]') && fontSize >= 22 ? 55 : 0);
                push(accountNameTextFromElement(candidateElement), 'nearest text above friends/followers count', candidateElement, score);
            }
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    function detectAccountName(images = []) {
        const profileRoute = currentProfileRoute();

        // Use the visible profile heading before document metadata. Facebook's
        // metadata can become stale during SPA navigation and may contain a tab
        // title or a friends count instead of the account name.
        const routeKey = profileRouteCacheKey(profileRoute);
        const headerCandidates = profileHeaderNameCandidates(profileRoute);
        if (headerCandidates.length) return cacheAccountName(headerCandidates[0].value, profileRoute);

        // Photo descriptions are useful when the profile header has not yet
        // rendered or when viewing an individual photo route.
        for (const item of images.slice(0, 60)) {
            const description = String(item?.description || '');
            const patterns = [
                /^(?:Photo|Image)\s+by\s+(.+?)(?:\.|$)/i,
                /^(.+?)\s+(?:added|uploaded|posted)\s+(?:a\s+)?photo/i,
                /^(?:Photo|Image)\s+of\s+(.+?)(?:\.|$)/i
            ];
            for (const pattern of patterns) {
                const match = description.match(pattern);
                const cleaned = cleanAccountNameCandidate(match?.[1]);
                if (cleaned) return cacheAccountName(cleaned, profileRoute);
            }
        }

        // The scan starts at the top of the profile, where the name is normally
        // available. Reuse that strong result later when Facebook virtualises the
        // header out of the DOM while the scan is at the bottom.
        if (accountNameCache.routeKey === routeKey && accountNameCache.value) {
            return accountNameCache.value;
        }

        // Metadata is deliberately lower priority because Facebook often leaves
        // it stale after in-app navigation.
        for (const value of [
            document.querySelector('meta[property="og:title"]')?.content,
            document.querySelector('meta[name="title"]')?.content,
            document.title
        ]) {
            const cleaned = cleanAccountNameCandidate(value);
            if (cleaned) return cacheAccountName(cleaned, profileRoute);
        }

        if (profileRoute?.fallback) {
            const fallback = cleanAccountNameCandidate(
                String(profileRoute.fallback).replace(/[._-]+/g, ' ')
            );
            if (fallback) return cacheAccountName(fallback, profileRoute);
        }
        return 'Facebook';
    }

    function facebookPhotoId(item) {
        // Prefer the canonical key because it has already disambiguated URL
        // forms such as /photos/{owner-id}/{photo-id}/.
        const values = [item?.key, item?.sourceUrl];
        for (const value of values) {
            const photoId = extractPhotoId(value);
            if (photoId) return photoId;
        }
        return '';
    }

    function stableNumericCode(value) {
        let hash = 2166136261;
        for (const character of String(value || '')) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return String(hash % 100000000).padStart(8, '0');
    }

    function filenameIdentifier(item, position, total) {
        const seed = facebookPhotoId(item) || item?.key || item?.sourceUrl || item?.fullUrl;
        if (seed) return stableNumericCode(seed);
        const width = Math.max(4, String(total).length);
        return String(position).padStart(width, '0');
    }

    function filenameBase(item, position, total, requestedPrefix) {
        const prefix = sanitizeFilenamePart(requestedPrefix).slice(0, 70) || 'Facebook';
        const identifier = filenameIdentifier(item, position, total);
        return `${prefix}-${identifier}`.slice(0, 150);
    }

    function decodeFacebookEscapes(value) {
        return String(value || '')
            .replace(/\\u003[aA]/g, ':')
            .replace(/\\u002[fF]/g, '/')
            .replace(/\\u003[fF]/g, '?')
            .replace(/\\u0026/g, '&')
            .replace(/\\u003[dD]/g, '=')
            .replace(/\\u0025/g, '%')
            .replace(/\\x3[aA]/g, ':')
            .replace(/\\x2[fF]/g, '/')
            .replace(/\\x26/g, '&')
            .replace(/\\\//g, '/')
            .replace(/&amp;|&#0*38;/gi, '&');
    }

    function extractCdnUrlsFromText(text) {
        const decoded = decodeFacebookEscapes(text);
        const matches = decoded.match(/https?:\/\/[^"'<>\s\\]+/gi) || [];
        const urls = [];
        for (let match of matches) {
            match = match.replace(/[),.;]+$/g, '');
            try {
                const url = new URL(match);
                if (/fbcdn\.net$|\.fbcdn\.net$|fbsbx\.com$|\.fbsbx\.com$/i.test(url.hostname)) {
                    urls.push(url.href);
                }
            } catch (_) {
                // Ignore malformed strings from page data.
            }
        }
        return Array.from(new Set(urls));
    }

    function photoAssetPath(url) {
        try {
            return new URL(url, location.href).pathname;
        } catch (_) {
            return '';
        }
    }

    function isClearlyThumbnailUrl(url) {
        const rendition = getUrlRendition(url);
        const deliveredSide = Math.max(rendition.deliveredWidth, rendition.deliveredHeight);
        const maximumSide = Math.max(rendition.maxWidth, rendition.maxHeight);
        return deliveredSide > 0 && deliveredSide <= 320 && maximumSide >= 640;
    }

    function isLikelyLargeUrl(url) {
        const rendition = getUrlRendition(url);
        const deliveredSide = Math.max(rendition.deliveredWidth, rendition.deliveredHeight);
        const maximumSide = Math.max(rendition.maxWidth, rendition.maxHeight);
        if (deliveredSide >= 800) return true;
        if (rendition.deliveredKind === 's' && deliveredSide >= 500) return true;
        if (maximumSide >= 640 && deliveredSide >= maximumSide * 0.7) return true;
        return false;
    }

    function fetchText(url) {
        assertAllowedNetworkUrl(url);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: SETTINGS.requestTimeoutMs,
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
                },
                onload(response) {
                    if (response.status >= 200 && response.status < 400) {
                        resolve(String(response.responseText || response.response || ''));
                    } else {
                        reject(new Error(`Photo page HTTP ${response.status || 'unknown'}`));
                    }
                },
                onerror(error) {
                    reject(new Error(error?.error || 'Photo page network error'));
                },
                ontimeout() {
                    reject(new Error('Photo page request timed out'));
                }
            });
        });
    }

    function chooseBestSignedCandidate(urls, referenceUrl = '') {
        const referencePath = photoAssetPath(referenceUrl);
        const ranked = Array.from(new Set((urls || []).filter(Boolean)))
            .map(url => ({ url, ...getUrlRendition(url) }))
            .filter(candidate => !referencePath || photoAssetPath(candidate.url) === referencePath)
            .sort((a, b) => b.score - a.score);
        return ranked[0] || null;
    }

    async function resolveSignedLargeUrl(item, forcePhotoPage = false) {
        const localCandidates = Array.from(new Set([
            item.fullUrl,
            ...(item.candidateUrls || [])
        ].filter(Boolean)));
        let best = chooseBestSignedCandidate(localCandidates, item.fullUrl);

        if (!forcePhotoPage && best && isLikelyLargeUrl(best.url) && !isClearlyThumbnailUrl(best.url)) {
            return best.url;
        }

        if (!item.sourceUrl) return best?.url || item.fullUrl;

        const pageText = await fetchText(item.sourceUrl);
        const pageCandidates = extractCdnUrlsFromText(pageText);
        const matching = pageCandidates.filter(url => photoAssetPath(url) === photoAssetPath(item.fullUrl));
        best = chooseBestSignedCandidate([...localCandidates, ...matching], item.fullUrl) || best;

        if (best?.url) {
            item.fullUrl = best.url;
            item.resolutionScore = best.score;
            item.rendition = best;
            item.source = matching.includes(best.url) ? 'signed URL from photo page' : item.source;
            item.candidateUrls = Array.from(new Set([best.url, ...matching, ...localCandidates])).slice(0, 40);
            retainedImages.set(item.key, item);
            persistRetainedImages();
        }
        return best?.url || item.fullUrl;
    }


    function getPageWindow() {
        return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    }

    function ensureResolverWindow(initialUrl = '') {
        if (resolverWindowHandle && !resolverWindowHandle.closed) {
            // Do not focus the existing helper. Re-focusing it for every photo
            // was what made the resolver repeatedly jump in front of the user.
            return resolverWindowHandle;
        }

        const targetUrl = normalizeUrl(initialUrl) || `${location.origin}/`;
        assertFacebookPageUrl(targetUrl);
        resolverWindowHandle = window.open(
            targetUrl,
            SETTINGS.resolverWindowName,
            'width=900,height=720,resizable=yes,scrollbars=yes'
        );

        if (!resolverWindowHandle) {
            const pageWindow = getPageWindow();
            resolverWindowHandle = pageWindow.open(
                targetUrl,
                SETTINGS.resolverWindowName,
                'width=900,height=720,resizable=yes,scrollbars=yes'
            );
        }

        if (!resolverWindowHandle) {
            throw new Error('Optional Facebook viewer fallback was blocked. Allow pop-ups for facebook.com or leave the fallback disabled.');
        }

        return resolverWindowHandle;
    }

    function closeResolverWindow() {
        try {
            if (resolverWindowHandle && !resolverWindowHandle.closed) resolverWindowHandle.close();
        } catch (_) {
            // Ignore close failures.
        }
        resolverWindowHandle = null;
    }

    function popupCandidate(value, descriptor = '', source = '') {
        const url = normalizeUrl(value);
        if (!url || !/^https?:/i.test(url) || !/fbcdn\.net|fbsbx\.com/i.test(url)) return null;
        const rendition = getUrlRendition(url, descriptor);
        return {
            url,
            descriptor,
            source,
            ...rendition
        };
    }

    function candidatesFromPopupImage(img) {
        const candidates = [];
        const add = (value, descriptor = '', source = '') => {
            const candidate = popupCandidate(value, descriptor, source);
            if (candidate) candidates.push(candidate);
        };
        const addSrcset = (value, source) => {
            for (const part of String(value || '').split(',')) {
                const tokens = part.trim().split(/\s+/);
                add(tokens.shift(), tokens[0] || '', source);
            }
        };

        addSrcset(img.getAttribute('srcset'), 'img srcset');
        addSrcset(img.getAttribute('data-srcset'), 'img data-srcset');
        const picture = img.closest('picture');
        if (picture) {
            picture.querySelectorAll('source').forEach((source, index) => {
                addSrcset(source.getAttribute('srcset'), `picture source ${index + 1}`);
                addSrcset(source.getAttribute('data-srcset'), `picture data-srcset ${index + 1}`);
            });
        }

        // Facebook often leaves the tiny p110x80 URL in currentSrc while a
        // signed ctp=s1086x1448 URL is present in src, another attribute, or
        // React props. Rank by the ctp/stp rendition token, not insertion order.
        add(img.currentSrc, '', 'currentSrc');
        add(img.src, '', 'img src');
        add(img.getAttribute('src'), '', 'src attribute');
        add(img.getAttribute('data-src'), '', 'data-src attribute');
        add(img.dataset?.src, '', 'dataset src');

        for (const attr of Array.from(img.attributes || [])) {
            const value = attr.value || '';
            if (!/fbcdn\.net|fbsbx\.com/i.test(value)) continue;
            if (value.includes(',')) addSrcset(value, `attribute ${attr.name}`);
            else add(value, '', `attribute ${attr.name}`);
        }

        for (const value of collectReactCdnStrings(img)) {
            if (value.includes(',')) addSrcset(value, 'React image data');
            else add(value, '', 'React image data');
        }

        const unique = new Map();
        for (const candidate of candidates) {
            const existing = unique.get(candidate.url);
            if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
        }
        return Array.from(unique.values()).sort((a, b) => b.score - a.score);
    }

    function performanceCdnCandidates(doc) {
        const candidates = [];
        try {
            const entries = doc.defaultView?.performance?.getEntriesByType?.('resource') || [];
            for (const entry of entries) {
                const candidate = popupCandidate(entry.name, '', 'performance resource');
                if (candidate) candidates.push(candidate);
            }
        } catch (_) {
            // Performance entries are an optional extra source.
        }

        for (const element of doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="preload"][as="image"]')) {
            const candidate = popupCandidate(element.content || element.href, '', 'page metadata');
            if (candidate) candidates.push(candidate);
        }
        return candidates;
    }

    function chooseMainPhotoFromDocument(doc, item) {
        if (!doc) return null;
        const referencePath = photoAssetPath(item.fullUrl);
        const exact = Array.from(doc.querySelectorAll('img[data-visualcompletion="media-vc-image"]'));
        const dialog = Array.from(doc.querySelectorAll('[role="dialog"] img'));
        const all = Array.from(doc.images || []);
        const images = Array.from(new Set([...exact, ...dialog, ...all]));
        const ranked = [];

        for (const img of images) {
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            const area = width * height;
            if (area < 100 * 100) continue;

            const alt = String(img.alt || '').toLowerCase();
            for (const candidate of candidatesFromPopupImage(img)) {
                const path = photoAssetPath(candidate.url);
                let score = candidate.score * 1000 + area;
                if (path && referencePath && path === referencePath) score += 10_000_000_000_000_000;
                if (img.matches('[data-visualcompletion="media-vc-image"]')) score += 1_000_000_000_000;
                if (img.closest('[role="dialog"]')) score += 100_000_000_000;
                if (/profile picture|avatar|emoji|sticker|reaction/.test(alt) && Math.max(width, height) < 700) score -= 500_000_000_000;
                if (isClearlyThumbnailUrl(candidate.url)) score -= 5_000_000_000_000;
                ranked.push({ ...candidate, width, height, score, element: img });
            }
        }

        // The exact signed large URL is guaranteed to have been requested if
        // Facebook actually displayed it. Performance entries catch it even
        // when React leaves the thumbnail in currentSrc.
        for (const candidate of performanceCdnCandidates(doc)) {
            const path = photoAssetPath(candidate.url);
            let score = candidate.score * 1000;
            if (path && referencePath && path === referencePath) score += 10_000_000_000_000_000;
            if (isClearlyThumbnailUrl(candidate.url)) score -= 5_000_000_000_000;
            ranked.push({ ...candidate, width: candidate.deliveredWidth, height: candidate.deliveredHeight, score, element: null });
        }

        ranked.sort((a, b) => b.score - a.score);
        const best = ranked[0] || null;
        if (best) best.candidateUrls = Array.from(new Set(ranked.map(candidate => candidate.url))).slice(0, 30);
        return best;
    }

    async function resolveViaPhotoWindow(item, position, total) {
        if (!item.sourceUrl) throw new Error('No Facebook photo permalink was retained for this image.');
        const helper = ensureResolverWindow();
        const targetUrl = new URL(item.sourceUrl, location.href);
        targetUrl.hash = '';
        assertFacebookPageUrl(targetUrl.href);
        const targetPhotoId = extractPhotoId(targetUrl.href);

        try {
            helper.location.replace(targetUrl.href);
        } catch (_) {
            helper.location.href = targetUrl.href;
        }

        const startedAt = Date.now();
        let stableUrl = '';
        let stableRounds = 0;
        let lastBest = null;

        while (Date.now() - startedAt < SETTINGS.resolverTimeoutMs) {
            if (!helper || helper.closed) throw new Error('The Facebook resolver window was closed.');
            await sleep(SETTINGS.resolverPollMs);

            try {
                const currentPhotoId = extractPhotoId(helper.location.href);
                if (targetPhotoId && currentPhotoId && currentPhotoId !== targetPhotoId) continue;

                const best = chooseMainPhotoFromDocument(helper.document, item);
                if (!best) continue;
                const encodedSide = Math.max(best.deliveredWidth || 0, best.deliveredHeight || 0);
                if (best.element) {
                    if (!best.element.complete || best.width <= 0 || best.height <= 0) continue;
                } else if (encodedSide <= 0) {
                    continue;
                }
                lastBest = best;

                if (best.url === stableUrl) stableRounds += 1;
                else {
                    stableUrl = best.url;
                    stableRounds = 1;
                }

                const largestSide = Math.max(best.width || 0, best.height || 0, encodedSide);
                const isMediaImage = Boolean(best.element?.matches?.('[data-visualcompletion="media-vc-image"]'));
                const pageReady = helper.document.readyState === 'complete';
                const signedLarge = best.deliveredKind === 's' && encodedSide >= SETTINGS.minimumSavedSide;
                if ((signedLarge || largestSide >= SETTINGS.minimumSavedSide) && ((isMediaImage && stableRounds >= 2) || (pageReady && stableRounds >= 3))) {
                    return {
                        url: best.url,
                        candidateUrls: best.candidateUrls || [best.url],
                        renderedWidth: best.width || best.deliveredWidth || 0,
                        renderedHeight: best.height || best.deliveredHeight || 0
                    };
                }
            } catch (error) {
                if (error?.name !== 'SecurityError') console.debug('Resolver poll:', error);
            }
        }

        if (lastBest) {
            return {
                url: lastBest.url,
                candidateUrls: lastBest.candidateUrls || [lastBest.url],
                renderedWidth: lastBest.width || lastBest.deliveredWidth || 0,
                renderedHeight: lastBest.height || lastBest.deliveredHeight || 0
            };
        }
        throw new Error(`Photo page ${position}/${total} did not expose a usable main image within ${Math.round(SETTINGS.resolverTimeoutMs / 1000)} seconds.`);
    }

    async function fetchLargestWorkingAsset(resolved) {
        // Never mutate Facebook's signed query string. In particular, replacing
        // ctp=p110x80 with ctp=s1086x1448 invalidates the matching oh signature.
        const urls = Array.from(new Set([resolved.url, ...(resolved.candidateUrls || [])].filter(Boolean)))
            .map(url => ({ url, ...getUrlRendition(url) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(candidate => candidate.url);
        let best = null;
        const errors = [];
        for (const url of urls) {
            try {
                const fetched = await fetchImage(url);
                const dimensions = await readImageDimensions(fetched.buffer, fetched.contentType);
                const area = dimensions.width * dimensions.height;
                if (!best || area > best.area) best = { url, fetched, dimensions, area };
                // Once the signed URL actually decodes at the maximum hint, do
                // not waste requests on lower-ranked candidates.
                const rendition = getUrlRendition(url);
                const maxArea = (rendition.maxWidth || 0) * (rendition.maxHeight || 0);
                if (maxArea && area >= maxArea * 0.85) break;
            } catch (error) {
                errors.push(`${url}: ${error?.message || error}`);
            }
        }
        if (!best) throw new Error(errors.join(' | ') || 'Could not fetch the resolved photo asset.');
        return best;
    }

    async function readImageDimensions(buffer, contentType) {
        const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' });
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(blob);
            try {
                return { width: bitmap.width, height: bitmap.height };
            } finally {
                bitmap.close();
            }
        }

        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Could not decode downloaded image'));
            };
            image.src = objectUrl;
        });
    }

    function downloadedImageLooksLargeEnough(url, dimensions) {
        const rendition = getUrlRendition(url);
        const actualSide = Math.max(dimensions.width || 0, dimensions.height || 0);
        const maximumSide = Math.max(rendition.maxWidth, rendition.maxHeight);
        const deliveredSide = Math.max(rendition.deliveredWidth, rendition.deliveredHeight);

        if (maximumSide >= 640 && actualSide < maximumSide * 0.55) return false;
        if (deliveredSide >= 500 && actualSide < deliveredSide * 0.75) return false;
        if (isClearlyThumbnailUrl(url) && actualSide <= 400) return false;
        return actualSide > 0;
    }

    function renditionLabel(url) {
        const info = getUrlRendition(url);
        const delivered = info.deliveredWidth && info.deliveredHeight
            ? `${info.deliveredKind || '?'}${info.deliveredWidth}×${info.deliveredHeight}`
            : 'size not encoded';
        const maximum = info.maxWidth && info.maxHeight
            ? `${info.maxWidth}×${info.maxHeight}`
            : 'not encoded';
        return { delivered, maximum, info };
    }

    function previewMetadata(item) {
        const rendition = renditionLabel(item.fullUrl);
        const rendered = `${item.width || 0}×${item.height || 0}`;
        const isSquare = item.width > 0 && item.width === item.height;
        const label = isSquare
            ? `Preview crop · ${rendered}`
            : `Preview · ${rendered}`;
        const detail = [
            isSquare
                ? 'Facebook is displaying a square grid crop. This does not describe the source image aspect ratio.'
                : 'Facebook is displaying a grid preview. This does not describe the verified source image dimensions.',
            `Current preview rendition: ${rendition.delivered}.`,
            `Maximum resize box hint: ${rendition.maximum}.`,
            'The verified full-image dimensions appear below after resolution.'
        ].join('\n');
        return { label, detail };
    }

    function setCardResolutionState(card, text, state = 'pending') {
        const element = card?.querySelector('.fbfr-resolution-state');
        if (!element) return;
        element.textContent = text;
        element.dataset.state = state;
    }

    function updateFilenamePreviews(modal) {
        const prefixInput = modal.querySelector('.fbfr-prefix-input');
        const prefix = sanitizeFilenamePart(prefixInput?.value).slice(0, 70) || 'Facebook';
        const cards = Array.from(modal.querySelectorAll('.fbfr-card'));
        for (const card of cards) {
            const index = Number(card.dataset.index);
            const item = modal._fbfrImages[index];
            const preview = card.querySelector('.fbfr-filename-preview');
            if (!item || !preview) continue;
            preview.textContent = `Filename: ${filenameBase(item, index + 1, modal._fbfrImages.length, prefix)}.*`;
        }
    }

    function parseResponseHeader(rawHeaders, wantedName) {
        const wanted = String(wantedName).toLowerCase();
        for (const line of String(rawHeaders || '').split(/\r?\n/)) {
            const separator = line.indexOf(':');
            if (separator < 0) continue;
            if (line.slice(0, separator).trim().toLowerCase() === wanted) {
                return line.slice(separator + 1).trim();
            }
        }
        return '';
    }

    function extensionForContentType(contentType, url) {
        const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
        const map = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/avif': 'avif',
            'image/bmp': 'bmp'
        };
        if (map[mime]) return map[mime];

        try {
            const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
            if (match && /^(jpe?g|png|webp|gif|avif|bmp)$/i.test(match[1])) {
                return match[1].toLowerCase().replace('jpeg', 'jpg');
            }
        } catch (_) {
            // Use jpg below.
        }

        return 'jpg';
    }

    function fetchImage(url) {
        assertAllowedNetworkUrl(url);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                timeout: SETTINGS.requestTimeoutMs,
                onload(response) {
                    if (response.status >= 200 && response.status < 300 && response.response) {
                        resolve({
                            buffer: response.response,
                            contentType: parseResponseHeader(response.responseHeaders, 'content-type')
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status || 'unknown'}`));
                    }
                },
                onerror(error) {
                    reject(new Error(error?.error || 'Network error'));
                },
                ontimeout() {
                    reject(new Error(`Timed out after ${Math.round(SETTINGS.requestTimeoutMs / 1000)} seconds`));
                }
            });
        });
    }

    async function fileExists(directoryHandle, filename) {
        try {
            await directoryHandle.getFileHandle(filename);
            return true;
        } catch (error) {
            if (error?.name === 'NotFoundError') return false;
            if (error?.name === 'TypeMismatchError') return true;
            throw error;
        }
    }

    async function createUniqueFile(directoryHandle, requestedName, reservedNames) {
        const dot = requestedName.lastIndexOf('.');
        const stem = dot > 0 ? requestedName.slice(0, dot) : requestedName;
        const extension = dot > 0 ? requestedName.slice(dot) : '';

        for (let suffix = 0; suffix < 100000; suffix += 1) {
            const name = suffix === 0 ? requestedName : `${stem}-${suffix + 1}${extension}`;
            const normalized = name.toLowerCase();
            if (reservedNames.has(normalized)) continue;
            if (await fileExists(directoryHandle, name)) continue;

            reservedNames.add(normalized);
            return {
                name,
                handle: await directoryHandle.getFileHandle(name, { create: true })
            };
        }

        throw new Error(`Could not find a free filename for ${requestedName}`);
    }

    async function prepareFileForPolicy(directoryHandle, requestedName, reservedNames, policy) {
        const normalized = requestedName.toLowerCase();
        if (policy === 'replace') {
            reservedNames.add(normalized);
            return {
                name: requestedName,
                handle: await directoryHandle.getFileHandle(requestedName, { create: true }),
                skipped: false
            };
        }

        if (policy === 'skip') {
            const exists = reservedNames.has(normalized) || await fileExists(directoryHandle, requestedName);
            if (exists) return { name: requestedName, handle: null, skipped: true };
            reservedNames.add(normalized);
            return {
                name: requestedName,
                handle: await directoryHandle.getFileHandle(requestedName, { create: true }),
                skipped: false
            };
        }

        return { ...(await createUniqueFile(directoryHandle, requestedName, reservedNames)), skipped: false };
    }

    async function writeBuffer(fileHandle, buffer, contentType) {
        const writable = await fileHandle.createWritable();
        try {
            await writable.write(new Blob([buffer], {
                type: contentType || 'application/octet-stream'
            }));
            await writable.close();
        } catch (error) {
            try {
                if (typeof writable.abort === 'function') await writable.abort();
            } catch (_) {
                // Preserve the original write error.
            }
            throw error;
        }
    }

    function setModalStatus(text, type = 'normal') {
        const element = document.getElementById(IDS.status);
        if (!element) return;
        element.textContent = text;
        element.style.color =
            type === 'error' ? '#b91c1c' :
            type === 'success' ? '#047857' :
            '#334155';
    }

    function clampLauncherPosition(left, top, viewportWidth, viewportHeight, launcherWidth, launcherHeight) {
        const maxLeft = Math.max(0, Number(viewportWidth || 0) - Number(launcherWidth || 0));
        const maxTop = Math.max(0, Number(viewportHeight || 0) - Number(launcherHeight || 0));
        return {
            left: Math.max(0, Math.min(Number(left) || 0, maxLeft)),
            top: Math.max(0, Math.min(Number(top) || 0, maxTop))
        };
    }

    function currentFilenamePrefix(modal) {
        return sanitizeFilenamePart(
            modal.querySelector('.fbfr-prefix-input')?.value || detectAccountName(modal._fbfrImages)
        ).slice(0, 70) || 'Facebook';
    }

    function selectedEntriesFromModal(modal) {
        return Array.from(modal.querySelectorAll('.fbfr-card'))
            .filter(card => card.querySelector('input[type="checkbox"]')?.checked)
            .map(card => {
                const index = Number(card.dataset.index);
                return {
                    card,
                    index,
                    item: Number.isInteger(index) ? modal._fbfrImages[index] : null
                };
            })
            .filter(entry => entry.item);
    }

    function selectedCount(modal) {
        return modal
            ? Array.from(modal.querySelectorAll('.fbfr-card input[type="checkbox"]')).filter(box => box.checked).length
            : 0;
    }

    function setFolderSummary(modal, text, state = 'normal') {
        if (!modal?._fbfrFolderSummary) return;
        modal._fbfrFolderSummary.textContent = text;
        modal._fbfrFolderSummary.dataset.state = state;
    }

    function updateDownloadActionState(modal) {
        if (!modal?._fbfrDownloadButton || downloading) return;
        const button = modal._fbfrDownloadButton;
        const count = selectedCount(modal);

        if (!modal._fbfrDirectoryHandle) {
            button.disabled = true;
            button.textContent = count ? `Download ${count} selected` : 'Download selected';
            button.title = 'Choose a folder and check it before downloading.';
            return;
        }

        if (modal._fbfrFolderChecking) {
            button.disabled = true;
            button.textContent = 'Checking folder…';
            button.title = 'The selected folder is being checked for existing files.';
            return;
        }

        if (!modal._fbfrFolderCheckComplete) {
            button.disabled = true;
            button.textContent = 'Check folder first';
            button.title = 'Recheck the selected folder before downloading.';
            return;
        }

        button.disabled = count === 0;
        button.textContent = count ? `Download ${count} selected` : 'Nothing to download';
        button.title = count
            ? `Download ${count} selected full-resolution image${count === 1 ? '' : 's'} into ${modal._fbfrFolderName || 'the selected folder'}.`
            : 'No images are currently selected.';
    }

    async function ensureDirectoryPermission(directoryHandle) {
        if (!directoryHandle) return false;
        const options = { mode: 'readwrite' };
        try {
            if (typeof directoryHandle.queryPermission === 'function') {
                const current = await directoryHandle.queryPermission(options);
                if (current === 'granted') return true;
            }
            if (typeof directoryHandle.requestPermission === 'function') {
                return await directoryHandle.requestPermission(options) === 'granted';
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    async function readFolderInventory(directoryHandle) {
        const filenames = new Set();

        if (typeof directoryHandle.entries === 'function') {
            for await (const [name, handle] of directoryHandle.entries()) {
                if (!handle || handle.kind === 'file') filenames.add(String(name));
            }
            return filenames;
        }

        if (typeof directoryHandle.values === 'function') {
            for await (const handle of directoryHandle.values()) {
                if (handle?.kind === 'file' && handle.name) filenames.add(String(handle.name));
            }
            return filenames;
        }

        throw new Error('This browser cannot enumerate files in the selected folder.');
    }

    function matchingExistingFilename(fileNames, base) {
        if (!(fileNames instanceof Set) || !base) return '';
        const exactBase = String(base);
        for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
            const candidate = `${exactBase}.${extension}`;
            if (fileNames.has(candidate)) return candidate;
        }
        return '';
    }

    function applyFolderInventory(modal) {
        if (!modal?._fbfrFolderCheckComplete || !(modal._fbfrFolderFileNames instanceof Set)) {
            updateDownloadActionState(modal);
            return { existing: 0, selected: selectedCount(modal) };
        }

        const prefix = currentFilenamePrefix(modal);
        const policy = modal.querySelector('.fbfr-existing-policy')?.value || 'skip';
        let existing = 0;

        modal.querySelectorAll('.fbfr-card').forEach(card => {
            const index = Number(card.dataset.index);
            const item = Number.isInteger(index) ? modal._fbfrImages[index] : null;
            if (!item) return;

            const base = filenameBase(item, index + 1, modal._fbfrImages.length, prefix);
            const matchedName = matchingExistingFilename(modal._fbfrFolderFileNames, base);
            const checkbox = card.querySelector('input[type="checkbox"]');
            const folderBadge = card.querySelector('.fbfr-folder-badge');

            card.dataset.folderExisting = matchedName ? 'true' : 'false';
            card.dataset.folderFilename = matchedName;
            card.dataset.folderPolicy = policy;
            const existingOverlayFile = card.querySelector('.fbfr-existing-overlay-file');
            if (existingOverlayFile) {
                existingOverlayFile.textContent = matchedName || '';
                existingOverlayFile.title = matchedName || '';
            }
            if (folderBadge) {
                folderBadge.hidden = !matchedName;
                folderBadge.textContent = matchedName ? 'In folder' : '';
                folderBadge.title = matchedName || '';
            }

            if (matchedName) {
                existing += 1;
                if (policy === 'skip' && checkbox?.checked) {
                    checkbox.checked = false;
                    card.dataset.autoDeselectedExisting = 'true';
                }
            } else if (card.dataset.autoDeselectedExisting === 'true') {
                if (checkbox) checkbox.checked = true;
                delete card.dataset.autoDeselectedExisting;
            }

            if (matchedName && policy !== 'skip' && card.dataset.autoDeselectedExisting === 'true') {
                if (checkbox) checkbox.checked = true;
                delete card.dataset.autoDeselectedExisting;
            }
        });

        const selected = selectedCount(modal);
        const folderName = modal._fbfrFolderName || 'Selected folder';
        const policyNote = policy === 'skip'
            ? `${existing} existing file${existing === 1 ? '' : 's'} deselected`
            : `${existing} existing file${existing === 1 ? '' : 's'} found`;
        setFolderSummary(modal, `${folderName} · ${policyNote} · ${selected} selected`, 'ready');
        updateDownloadActionState(modal);
        return { existing, selected };
    }

    async function checkSelectedFolder(modal) {
        if (!modal?._fbfrDirectoryHandle || modal._fbfrFolderChecking || downloading) return;

        modal._fbfrFolderChecking = true;
        modal._fbfrFolderCheckComplete = false;
        if (modal._fbfrFolderButton) modal._fbfrFolderButton.disabled = true;
        if (modal._fbfrRecheckButton) modal._fbfrRecheckButton.disabled = true;
        setFolderSummary(modal, `Checking ${modal._fbfrFolderName || 'selected folder'} for existing files…`, 'working');
        setModalStatus('Checking the chosen folder before download. No files are being downloaded yet.');
        updateDownloadActionState(modal);

        try {
            const allowed = await ensureDirectoryPermission(modal._fbfrDirectoryHandle);
            if (!allowed) throw new Error('Read/write permission for the selected folder was not granted.');

            modal._fbfrFolderFileNames = await readFolderInventory(modal._fbfrDirectoryHandle);
            modal._fbfrFolderCheckComplete = true;
            const result = applyFolderInventory(modal);
            setModalStatus(
                `Folder checked. Review the selection, then click Download ${result.selected} selected when ready.`,
                'success'
            );
        } catch (error) {
            modal._fbfrFolderCheckComplete = false;
            setFolderSummary(modal, `Folder check failed: ${error?.message || error}`, 'error');
            setModalStatus(`Could not check the selected folder: ${error?.message || error}`, 'error');
        } finally {
            modal._fbfrFolderChecking = false;
            if (modal._fbfrFolderButton) modal._fbfrFolderButton.disabled = false;
            if (modal._fbfrRecheckButton) {
                modal._fbfrRecheckButton.disabled = !modal._fbfrDirectoryHandle;
                modal._fbfrRecheckButton.hidden = !modal._fbfrDirectoryHandle;
            }
            updateDownloadActionState(modal);
        }
    }

    async function chooseFolderAndCheck(modal) {
        if (downloading || modal?._fbfrFolderChecking) return;

        const pickerWindow = getPickerWindow();
        if (!pickerWindow) {
            setModalStatus('Folder saving requires Chrome or Edge with showDirectoryPicker().', 'error');
            return;
        }

        let directoryHandle;
        try {
            // The picker is the first activation-gated API in this click.
            directoryHandle = await pickerWindow.showDirectoryPicker({
                id: SETTINGS.pickerId,
                mode: 'readwrite',
                startIn: 'downloads'
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                setModalStatus('Folder selection cancelled.');
                return;
            }
            setModalStatus(`Could not open folder picker: ${error?.message || error}`, 'error');
            return;
        }

        modal._fbfrDirectoryHandle = directoryHandle;
        modal._fbfrFolderName = directoryHandle.name || 'Selected folder';
        modal._fbfrFolderFileNames = null;
        modal._fbfrFolderCheckComplete = false;
        if (modal._fbfrFolderButton) modal._fbfrFolderButton.textContent = 'Change folder';
        if (modal._fbfrRecheckButton) {
            modal._fbfrRecheckButton.hidden = false;
            modal._fbfrRecheckButton.disabled = false;
        }
        await checkSelectedFolder(modal);
    }

    async function saveSelected(modal, saveButton) {
        if (downloading) {
            cancelRequested = true;
            saveButton.disabled = true;
            saveButton.textContent = 'Stopping after current file…';
            return;
        }

        const selected = selectedEntriesFromModal(modal);
        const filenamePrefix = currentFilenamePrefix(modal);
        const useViewerFallback = Boolean(modal.querySelector('.fbfr-popup-fallback')?.checked);
        const existingPolicy = modal.querySelector('.fbfr-existing-policy')?.value || 'skip';
        const directoryHandle = modal._fbfrDirectoryHandle;

        if (!directoryHandle) {
            setModalStatus('Choose and check a folder first.', 'error');
            return;
        }
        if (!modal._fbfrFolderCheckComplete) {
            setModalStatus('Recheck the selected folder before downloading.', 'error');
            return;
        }
        if (!selected.length) {
            setModalStatus('Select at least one image first.', 'error');
            return;
        }

        const permissionGranted = await ensureDirectoryPermission(directoryHandle);
        if (!permissionGranted) {
            setModalStatus('Read/write permission for the selected folder was not granted.', 'error');
            return;
        }

        if (useViewerFallback && (!resolverWindowHandle || resolverWindowHandle.closed)) {
            setModalStatus('Viewer fallback is enabled but not prepared. Either prepare it first or turn the fallback off.', 'error');
            return;
        }

        downloading = true;
        cancelRequested = false;
        saveButton.disabled = false;
        saveButton.textContent = 'Stop after current file';
        if (modal._fbfrFolderButton) modal._fbfrFolderButton.disabled = true;
        if (modal._fbfrRecheckButton) modal._fbfrRecheckButton.disabled = true;
        if (modal._fbfrResumeButton) modal._fbfrResumeButton.disabled = true;
        if (modal._fbfrRetryButton) modal._fbfrRetryButton.disabled = true;
        const prefixControl = modal.querySelector('.fbfr-prefix-input');
        if (prefixControl) prefixControl.disabled = true;
        const existingPolicyControl = modal.querySelector('.fbfr-existing-policy');
        if (existingPolicyControl) existingPolicyControl.disabled = true;

        const failures = [];
        const reservedNames = new Set();
        let saved = 0;
        let skippedExisting = 0;
        let backgroundResolved = 0;
        let viewerResolved = 0;

        try {
            for (let index = 0; index < selected.length; index += 1) {
                if (cancelRequested) break;

                const entry = selected[index];
                const item = entry.item;
                const card = entry.card;
                const position = index + 1;
                const base = filenameBase(item, entry.index + 1, modal._fbfrImages.length, filenamePrefix);

                try {
                    updateDownloadHistory(item, 'pending');
                    applyHistoryToCard(card, item, false);
                    let asset = null;
                    let resolutionSource = 'background photo-page request';
                    let backgroundError = null;

                    setModalStatus(`Resolving in background ${position}/${selected.length}: ${base}`);
                    setCardResolutionState(card, 'Resolving signed full image in the background…', 'working');

                    try {
                        const signedUrl = await resolveSignedLargeUrl(item, true);
                        const backgroundCandidate = {
                            url: signedUrl,
                            candidateUrls: Array.from(new Set([
                                signedUrl,
                                ...(item.candidateUrls || []),
                                item.fullUrl
                            ].filter(Boolean)))
                        };
                        asset = await fetchLargestWorkingAsset(backgroundCandidate);

                        if (Math.max(asset.dimensions.width, asset.dimensions.height) < SETTINGS.minimumSavedSide ||
                            !downloadedImageLooksLargeEnough(asset.url, asset.dimensions)) {
                            throw new Error(`Background response only produced ${asset.dimensions.width}×${asset.dimensions.height}.`);
                        }
                        backgroundResolved += 1;
                    } catch (error) {
                        backgroundError = error;
                        asset = null;
                    }

                    if (!asset && useViewerFallback) {
                        setModalStatus(`Using viewer fallback ${position}/${selected.length}: ${base}`);
                        setCardResolutionState(card, 'Background lookup did not expose the large rendition. Trying the prepared viewer fallback…', 'working');
                        const resolved = await resolveViaPhotoWindow(item, position, selected.length);
                        asset = await fetchLargestWorkingAsset(resolved);
                        resolutionSource = 'optional Facebook viewer fallback';

                        if (Math.max(asset.dimensions.width, asset.dimensions.height) < SETTINGS.minimumSavedSide ||
                            !downloadedImageLooksLargeEnough(asset.url, asset.dimensions)) {
                            throw new Error(`Viewer fallback only produced ${asset.dimensions.width}×${asset.dimensions.height}.`);
                        }
                        viewerResolved += 1;
                    }

                    if (!asset) {
                        const reason = backgroundError?.message || String(backgroundError || 'No signed large rendition was found.');
                        throw new Error(`${reason} Viewer fallback was not used.`);
                    }

                    const resolvedUrl = asset.url;
                    const fetched = asset.fetched;
                    const dimensions = asset.dimensions;
                    item.fullUrl = resolvedUrl;
                    item.source = resolutionSource;
                    item.resolutionScore = dimensions.width * dimensions.height;
                    retainedImages.set(item.key, item);
                    persistRetainedImages();

                    const verifiedPreview = card.querySelector('img');
                    if (verifiedPreview) {
                        verifiedPreview.src = resolvedUrl;
                        verifiedPreview.dataset.fullResolution = 'true';
                    }
                    const verifiedMeta = card.querySelector('.fbfr-meta > span');
                    if (verifiedMeta) verifiedMeta.textContent = `Full image · ${dimensions.width}×${dimensions.height}`;

                    const extension = extensionForContentType(fetched.contentType, resolvedUrl);
                    const requestedName = `${base}.${extension}`;
                    const file = await prepareFileForPolicy(directoryHandle, requestedName, reservedNames, existingPolicy);
                    const sourceLabel = resolutionSource.startsWith('background') ? 'background' : 'viewer fallback';

                    if (file.skipped) {
                        modal._fbfrFolderFileNames?.add(file.name);
                        updateDownloadHistory(item, 'skipped_existing', {
                            filename: file.name,
                            width: dimensions.width,
                            height: dimensions.height
                        });
                        applyHistoryToCard(card, item, false);
                        setCardResolutionState(card, `Verified full image: ${dimensions.width}×${dimensions.height} · ${sourceLabel} · ${file.name} already exists, skipped`, 'success');
                        const completedCheckbox = card.querySelector('input[type="checkbox"]');
                        if (completedCheckbox) completedCheckbox.checked = false;
                        skippedExisting += 1;
                        continue;
                    }

                    setModalStatus(`Writing ${position}/${selected.length}: ${file.name} (${dimensions.width}×${dimensions.height})`);
                    await writeBuffer(file.handle, fetched.buffer, fetched.contentType);
                    modal._fbfrFolderFileNames?.add(file.name);
                    updateDownloadHistory(item, 'saved', {
                        filename: file.name,
                        width: dimensions.width,
                        height: dimensions.height
                    });
                    applyHistoryToCard(card, item, false);
                    setCardResolutionState(card, `Verified full image: ${dimensions.width}×${dimensions.height} · ${sourceLabel} · saved as ${file.name}`, 'success');
                    const completedCheckbox = card.querySelector('input[type="checkbox"]');
                    if (completedCheckbox) completedCheckbox.checked = false;
                    saved += 1;
                } catch (error) {
                    updateDownloadHistory(item, 'failed', { error: error?.message || String(error) });
                    applyHistoryToCard(card, item, false);
                    setCardResolutionState(card, `Not saved: ${error?.message || String(error)}`, 'error');
                    failures.push({
                        position,
                        url: item.fullUrl,
                        sourceUrl: item.sourceUrl,
                        error: error?.message || String(error)
                    });
                    console.error(`Full-resolution folder download failed for item ${position}:`, error, item);
                }
            }

            const notProcessed = selected.length - saved - skippedExisting - failures.length;
            const sourceSummary = `background ${backgroundResolved}, viewer fallback ${viewerResolved}`;
            const text = cancelRequested
                ? `Stopped. Saved ${saved}; existing skipped ${skippedExisting}; failed ${failures.length}; not processed ${notProcessed} (${sourceSummary}).`
                : `Finished. Saved ${saved} full-resolution file${saved === 1 ? '' : 's'}; existing skipped ${skippedExisting}; failed ${failures.length} (${sourceSummary}).`;

            setModalStatus(text, failures.length ? 'error' : 'success');
            if (failures.length) console.table(failures);
        } finally {
            downloading = false;
            cancelRequested = false;
            if (modal._fbfrFolderButton) modal._fbfrFolderButton.disabled = false;
            if (modal._fbfrRecheckButton) modal._fbfrRecheckButton.disabled = false;
            if (prefixControl) prefixControl.disabled = false;
            if (existingPolicyControl) existingPolicyControl.disabled = false;
            applyFolderInventory(modal);
            refreshHistoryUi(modal);
            updateDownloadActionState(modal);
        }
    }

    function renderModal(images, scanInfo = {}) {
        document.getElementById(IDS.overlay)?.remove();

        const overlay = document.createElement('div');
        overlay.id = IDS.overlay;

        const modal = document.createElement('div');
        modal.id = IDS.modal;
        modal._fbfrImages = images;
        modal._fbfrDirectoryHandle = null;
        modal._fbfrFolderName = '';
        modal._fbfrFolderFileNames = null;
        modal._fbfrFolderCheckComplete = false;
        modal._fbfrFolderChecking = false;

        const header = document.createElement('div');
        header.className = 'fbfr-header';

        const heading = document.createElement('div');
        const scanSuffix = scanInfo.stoppedManually
            ? ' Scan was stopped manually.'
            : scanInfo.reachedLimit
                ? ' The safety round limit was reached; another scan can continue and merge results.'
                : ' The page remained idle at the bottom for all settle rounds.';
        heading.innerHTML = `
            <h2>Facebook Image Downloader</h2>
            <div class="fbfr-subtitle">
                Found ${images.length} photo${images.length === 1 ? '' : 's'}. Select images for folder download, or hover a preview and click 💾 to download that one image at its verified maximum resolution.${scanSuffix}
            </div>
        `;

        const headerActions = document.createElement('div');
        headerActions.className = 'fbfr-actions';

        const scanAgainButton = document.createElement('button');
        scanAgainButton.type = 'button';
        scanAgainButton.textContent = 'Scan current page and merge';

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.textContent = 'Clear retained list';

        const clearHistoryButton = document.createElement('button');
        clearHistoryButton.type = 'button';
        clearHistoryButton.textContent = 'Clear download history';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => {
            if (!downloading) overlay.remove();
        });

        scanAgainButton.addEventListener('click', () => {
            if (downloading) return;
            overlay.remove();
            void scanPage();
        });

        clearButton.addEventListener('click', () => {
            if (downloading) return;
            if (!confirm('Clear all retained scan results in this Facebook tab?')) return;
            clearRetainedImages();
            overlay.remove();
        });

        clearHistoryButton.addEventListener('click', () => {
            if (downloading) return;
            if (!confirm('Clear saved, failed, pending, and skipped download history? No files will be deleted.')) return;
            clearDownloadHistory();
            renderModal(images, scanInfo);
        });

        headerActions.appendChild(scanAgainButton);
        headerActions.appendChild(clearButton);
        headerActions.appendChild(clearHistoryButton);
        headerActions.appendChild(closeButton);
        header.appendChild(heading);
        header.appendChild(headerActions);

        const toolbar = document.createElement('div');
        toolbar.className = 'fbfr-toolbar';

        const status = document.createElement('div');
        status.id = IDS.status;
        status.textContent = 'Choose a folder first. The script will check which filenames already exist, deselect them, and wait for you to start the download.';

        const folderSummary = document.createElement('div');
        folderSummary.className = 'fbfr-folder-summary';
        folderSummary.textContent = 'No folder selected.';
        folderSummary.dataset.state = 'normal';
        modal._fbfrFolderSummary = folderSummary;

        const historySummary = document.createElement('div');
        historySummary.className = 'fbfr-subtitle';
        modal._fbfrHistorySummary = historySummary;

        const filenameSettings = document.createElement('div');
        filenameSettings.className = 'fbfr-filename-settings';

        const prefixLabel = document.createElement('label');
        prefixLabel.textContent = 'Filename prefix';

        const prefixInput = document.createElement('input');
        prefixInput.type = 'text';
        prefixInput.className = 'fbfr-prefix-input';
        prefixInput.value = detectAccountName(images);
        prefixInput.maxLength = 70;
        prefixInput.spellcheck = false;
        prefixInput.title = 'Files use this account prefix plus a short stable number derived from the Facebook photo ID. A sequence is used only as a fallback.';

        const prefixHelp = document.createElement('span');
        prefixHelp.className = 'fbfr-filename-help';
        prefixHelp.textContent = 'Example: Account Name-48392017.jpg';

        filenameSettings.appendChild(prefixLabel);
        filenameSettings.appendChild(prefixInput);
        filenameSettings.appendChild(prefixHelp);

        const selectAll = document.createElement('button');
        selectAll.type = 'button';
        selectAll.textContent = 'All';
        selectAll.title = 'Select every image';

        const selectSrcset = document.createElement('button');
        selectSrcset.type = 'button';
        selectSrcset.textContent = 'Likely full-size';
        selectSrcset.title = 'Select entries that already carry a likely large signed rendition';

        const selectNone = document.createElement('button');
        selectNone.type = 'button';
        selectNone.textContent = 'None';
        selectNone.title = 'Clear the current selection';

        const resumeButton = document.createElement('button');
        resumeButton.type = 'button';
        modal._fbfrResumeButton = resumeButton;

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        modal._fbfrRetryButton = retryButton;

        const existingControls = document.createElement('span');
        existingControls.className = 'fbfr-existing-controls';
        const existingLabel = document.createElement('label');
        existingLabel.textContent = 'If file exists';
        const existingPolicy = document.createElement('select');
        existingPolicy.className = 'fbfr-existing-policy';
        existingPolicy.innerHTML = `
            <option value="skip" selected>Skip it</option>
            <option value="uniquify">Keep both</option>
            <option value="replace">Replace it</option>
        `;
        existingPolicy.title = 'Skip leaves an existing filename untouched. Keep both creates -2, -3, and so on. Replace overwrites the matching file.';
        existingControls.appendChild(existingLabel);
        existingControls.appendChild(existingPolicy);

        const fallbackLabel = document.createElement('label');
        fallbackLabel.className = 'fbfr-fallback-option';
        fallbackLabel.title = 'Leave this off for a popup-free run. Enable it only when background resolution misses some photos.';

        const fallbackCheckbox = document.createElement('input');
        fallbackCheckbox.type = 'checkbox';
        fallbackCheckbox.className = 'fbfr-popup-fallback';
        fallbackCheckbox.checked = false;

        const fallbackText = document.createElement('span');
        fallbackText.textContent = 'Use a prepared viewer only when background resolution fails';
        fallbackLabel.appendChild(fallbackCheckbox);
        fallbackLabel.appendChild(fallbackText);

        const prepareButton = document.createElement('button');
        prepareButton.type = 'button';
        prepareButton.textContent = 'Prepare viewer fallback';

        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'fbfr-folder-button';
        folderButton.textContent = 'Choose folder';
        folderButton.title = 'Choose a destination folder and check it for files that are already present.';
        modal._fbfrFolderButton = folderButton;

        const recheckButton = document.createElement('button');
        recheckButton.type = 'button';
        recheckButton.className = 'fbfr-recheck-button';
        recheckButton.textContent = 'Recheck';
        recheckButton.title = 'Scan the chosen folder again if files were added or removed outside this window.';
        recheckButton.hidden = true;
        recheckButton.disabled = true;
        modal._fbfrRecheckButton = recheckButton;

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'fbfr-primary fbfr-start-button';
        saveButton.textContent = 'Download selected';
        saveButton.disabled = true;
        modal._fbfrDownloadButton = saveButton;

        const statusPanel = document.createElement('div');
        statusPanel.className = 'fbfr-status-panel';
        statusPanel.appendChild(status);
        statusPanel.appendChild(folderSummary);
        statusPanel.appendChild(historySummary);

        const topActions = document.createElement('div');
        topActions.className = 'fbfr-top-actions';
        topActions.appendChild(folderButton);
        topActions.appendChild(recheckButton);
        topActions.appendChild(saveButton);

        const toolbarTop = document.createElement('div');
        toolbarTop.className = 'fbfr-toolbar-top';
        toolbarTop.appendChild(statusPanel);
        toolbarTop.appendChild(topActions);

        const selectionGroup = document.createElement('div');
        selectionGroup.className = 'fbfr-control-group fbfr-grow';
        const selectionLabel = document.createElement('span');
        selectionLabel.className = 'fbfr-control-label';
        selectionLabel.textContent = 'Selection';
        const selectionButtons = document.createElement('span');
        selectionButtons.className = 'fbfr-segmented';
        selectionButtons.appendChild(selectAll);
        selectionButtons.appendChild(selectSrcset);
        selectionButtons.appendChild(selectNone);
        selectionGroup.appendChild(selectionLabel);
        selectionGroup.appendChild(selectionButtons);

        const progressGroup = document.createElement('div');
        progressGroup.className = 'fbfr-control-group';
        const progressLabel = document.createElement('span');
        progressLabel.className = 'fbfr-control-label';
        progressLabel.textContent = 'Progress';
        const historyControls = document.createElement('span');
        historyControls.className = 'fbfr-segmented fbfr-history-controls';
        historyControls.appendChild(resumeButton);
        historyControls.appendChild(retryButton);
        progressGroup.appendChild(progressLabel);
        progressGroup.appendChild(historyControls);

        const toolbarMain = document.createElement('div');
        toolbarMain.className = 'fbfr-toolbar-main';
        toolbarMain.appendChild(selectionGroup);
        toolbarMain.appendChild(progressGroup);

        const advanced = document.createElement('details');
        advanced.className = 'fbfr-advanced';
        const advancedSummary = document.createElement('summary');
        advancedSummary.textContent = 'Advanced';
        const advancedPanel = document.createElement('div');
        advancedPanel.className = 'fbfr-advanced-panel';
        advancedPanel.appendChild(fallbackLabel);
        advancedPanel.appendChild(prepareButton);
        advanced.appendChild(advancedSummary);
        advanced.appendChild(advancedPanel);

        const settingsRow = document.createElement('div');
        settingsRow.className = 'fbfr-settings-row';
        settingsRow.appendChild(filenameSettings);
        settingsRow.appendChild(existingControls);
        settingsRow.appendChild(advanced);

        toolbar.appendChild(toolbarTop);
        toolbar.appendChild(toolbarMain);
        toolbar.appendChild(settingsRow);

        const grid = document.createElement('div');
        grid.className = 'fbfr-grid';

        images.forEach((item, index) => {
            const card = document.createElement('label');
            card.className = 'fbfr-card';
            card.dataset.index = String(index);
            card.dataset.srcset = isLikelyLargeUrl(item.fullUrl) ? 'true' : 'false';

            const title = document.createElement('div');
            title.className = 'fbfr-card-title';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;

            const titleText = document.createElement('span');
            titleText.textContent = `#${index + 1}`;

            const folderBadge = document.createElement('span');
            folderBadge.className = 'fbfr-folder-badge';
            folderBadge.hidden = true;

            const historyBadge = document.createElement('span');
            historyBadge.className = 'fbfr-history-badge';
            historyBadge.hidden = true;

            const previewWrap = document.createElement('div');
            previewWrap.className = 'fbfr-preview-wrap';

            const preview = document.createElement('img');
            preview.src = item.thumbnailUrl || item.fullUrl;
            preview.alt = item.description || `Facebook image ${index + 1}`;
            preview.loading = 'lazy';

            const individualButton = document.createElement('button');
            individualButton.type = 'button';
            individualButton.className = 'fbfr-card-download';
            individualButton.textContent = '💾';
            individualButton.title = 'Download this image at the largest verified resolution';
            individualButton.setAttribute('aria-label', individualButton.title);

            const existingOverlay = document.createElement('div');
            existingOverlay.className = 'fbfr-existing-overlay';
            existingOverlay.setAttribute('aria-hidden', 'true');

            const existingOverlayIcon = document.createElement('span');
            existingOverlayIcon.className = 'fbfr-existing-overlay-icon';
            existingOverlayIcon.textContent = '✓';

            const existingOverlayTitle = document.createElement('span');
            existingOverlayTitle.className = 'fbfr-existing-overlay-title';
            existingOverlayTitle.textContent = 'Already in folder';

            const existingOverlayFile = document.createElement('span');
            existingOverlayFile.className = 'fbfr-existing-overlay-file';

            existingOverlay.appendChild(existingOverlayIcon);
            existingOverlay.appendChild(existingOverlayTitle);
            existingOverlay.appendChild(existingOverlayFile);

            previewWrap.appendChild(preview);
            previewWrap.appendChild(existingOverlay);
            previewWrap.appendChild(individualButton);

            const filenamePreview = document.createElement('span');
            filenamePreview.className = 'fbfr-filename-preview';

            const metaInfo = previewMetadata(item);
            const meta = document.createElement('div');
            meta.className = 'fbfr-meta';

            const metaText = document.createElement('span');
            metaText.textContent = metaInfo.label;

            const infoIcon = document.createElement('span');
            infoIcon.className = 'fbfr-meta-info';
            infoIcon.textContent = 'i';
            infoIcon.dataset.tooltip = metaInfo.detail;
            infoIcon.tabIndex = 0;
            infoIcon.setAttribute('role', 'button');
            infoIcon.setAttribute('aria-label', metaInfo.detail);

            meta.appendChild(metaText);
            meta.appendChild(infoIcon);

            const resolutionState = document.createElement('div');
            resolutionState.className = 'fbfr-resolution-state';
            resolutionState.dataset.state = 'pending';
            resolutionState.textContent = 'Full image not resolved yet.';

            individualButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void downloadSingleMaximum(item, individualButton, card, preview);
            });

            title.appendChild(checkbox);
            title.appendChild(titleText);
            title.appendChild(filenamePreview);
            title.appendChild(folderBadge);
            title.appendChild(historyBadge);
            card.appendChild(title);
            card.appendChild(previewWrap);
            card.appendChild(meta);
            card.appendChild(resolutionState);
            grid.appendChild(card);
            applyHistoryToCard(card, item, true);
        });

        updateFilenamePreviews(modal);
        prefixInput.addEventListener('input', () => {
            updateFilenamePreviews(modal);
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
        });

        selectAll.addEventListener('click', () => {
            grid.querySelectorAll('input[type="checkbox"]').forEach(box => {
                box.checked = true;
            });
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
            updateDownloadActionState(modal);
        });

        selectSrcset.addEventListener('click', () => {
            grid.querySelectorAll('.fbfr-card').forEach(card => {
                card.querySelector('input[type="checkbox"]').checked = card.dataset.srcset === 'true';
            });
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
            const count = selectedCount(modal);
            setModalStatus(`Selected ${count} likely full-size entr${count === 1 ? 'y' : 'ies'} after applying the folder check.`);
            updateDownloadActionState(modal);
        });

        selectNone.addEventListener('click', () => {
            grid.querySelectorAll('input[type="checkbox"]').forEach(box => {
                box.checked = false;
            });
            grid.querySelectorAll('.fbfr-card').forEach(card => delete card.dataset.autoDeselectedExisting);
            updateDownloadActionState(modal);
        });

        resumeButton.addEventListener('click', () => {
            grid.querySelectorAll('.fbfr-card').forEach(card => {
                const index = Number(card.dataset.index);
                const item = Number.isInteger(index) ? modal._fbfrImages[index] : null;
                const status = historyForItem(item)?.status || '';
                card.querySelector('input[type="checkbox"]').checked = !isCompletedHistoryStatus(status);
            });
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
            const count = selectedCount(modal);
            setModalStatus(`Selected ${count} unfinished image${count === 1 ? '' : 's'} for resume after applying the folder check.`);
            updateDownloadActionState(modal);
        });

        retryButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            grid.querySelectorAll('.fbfr-card').forEach(card => {
                const index = Number(card.dataset.index);
                const item = Number.isInteger(index) ? modal._fbfrImages[index] : null;
                card.querySelector('input[type="checkbox"]').checked = historyForItem(item)?.status === 'failed';
            });
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
            const count = selectedCount(modal);
            setModalStatus(`Selected ${count} failed image${count === 1 ? '' : 's'}. Review the selection, then start the download.`);
            updateDownloadActionState(modal);
        });

        prepareButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (downloading) return;

            try {
                const firstSelectedCard = Array.from(grid.querySelectorAll('.fbfr-card'))
                    .find(card => card.querySelector('input[type="checkbox"]')?.checked);
                const firstSelectedIndex = Number(firstSelectedCard?.dataset.index);
                const firstSelectedItem = Number.isInteger(firstSelectedIndex)
                    ? modal._fbfrImages[firstSelectedIndex]
                    : modal._fbfrImages[0];
                ensureResolverWindow(firstSelectedItem?.sourceUrl || location.origin);
                fallbackCheckbox.checked = true;
                prepareButton.textContent = 'Viewer fallback ready ✓';
                setModalStatus('Optional viewer fallback is ready. It will only be used when background resolution fails.', 'success');
            } catch (error) {
                prepareButton.textContent = 'Prepare viewer fallback';
                setModalStatus(error?.message || String(error), 'error');
            }
        });

        folderButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void chooseFolderAndCheck(modal);
        });

        recheckButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void checkSelectedFolder(modal);
        });

        existingPolicy.addEventListener('change', () => {
            if (modal._fbfrFolderCheckComplete) applyFolderInventory(modal);
            updateDownloadActionState(modal);
        });

        grid.addEventListener('change', event => {
            const checkbox = event.target.closest?.('.fbfr-card input[type="checkbox"]');
            if (!checkbox) return;
            const card = checkbox.closest('.fbfr-card');
            if (card && event.isTrusted) delete card.dataset.autoDeselectedExisting;
            if (card?.dataset.folderExisting === 'true' &&
                existingPolicy.value === 'skip' && checkbox.checked) {
                checkbox.checked = false;
                card.dataset.autoDeselectedExisting = 'true';
                setModalStatus('That file is already in the selected folder and remains deselected while “Skip it” is active.');
            }
            updateDownloadActionState(modal);
        });

        saveButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void saveSelected(modal, saveButton);
        });

        overlay.addEventListener('click', event => {
            if (event.target === overlay && !downloading) overlay.remove();
        });

        modal.appendChild(header);
        modal.appendChild(toolbar);
        modal.appendChild(grid);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        refreshHistoryUi(modal);
        updateDownloadActionState(modal);
    }

    function addMainButton() {
        const profileChanged = ensureRetainedProfileScope();
        if (document.getElementById(IDS.button)) {
            if (profileChanged) updateMainButtonIdle();
            return;
        }

        const container = document.createElement('div');
        container.id = IDS.container;

        const button = document.createElement('button');
        button.id = IDS.button;
        button.type = 'button';
        button.title = 'Open Facebook image downloader menu';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', IDS.menu);
        button.dataset.scanState = 'idle';

        const menuIcon = document.createElement('span');
        menuIcon.className = 'fbfr-menu-icon';
        menuIcon.textContent = '☰';
        menuIcon.setAttribute('aria-hidden', 'true');
        button.appendChild(menuIcon);

        const stallBadge = document.createElement('span');
        stallBadge.id = IDS.stallBadge;
        stallBadge.hidden = true;
        stallBadge.setAttribute('aria-hidden', 'true');
        button.appendChild(stallBadge);

        const menu = document.createElement('div');
        menu.id = IDS.menu;
        menu.hidden = true;
        menu.setAttribute('role', 'menu');

        const scanAction = document.createElement('button');
        scanAction.id = IDS.scanAction;
        scanAction.type = 'button';
        scanAction.className = 'fbfr-menu-action';
        scanAction.setAttribute('role', 'menuitem');

        const scanIcon = document.createElement('span');
        scanIcon.className = 'fbfr-menu-action-icon';
        scanIcon.textContent = '▦';
        scanIcon.setAttribute('aria-hidden', 'true');

        const scanCopy = document.createElement('span');
        scanCopy.className = 'fbfr-menu-action-copy';
        const scanTitle = document.createElement('span');
        scanTitle.className = 'fbfr-menu-action-title';
        scanTitle.textContent = 'Scan images';
        const scanSubtitle = document.createElement('span');
        scanSubtitle.className = 'fbfr-menu-action-subtitle';
        scanSubtitle.textContent = 'Deep-scan the current page, then open the image selector.';
        scanCopy.append(scanTitle, scanSubtitle);
        scanAction.append(scanIcon, scanCopy);
        menu.appendChild(scanAction);

        const closeMenu = () => {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        };
        const openMenu = () => {
            menu.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            window.setTimeout(() => scanAction.focus({ preventScroll: true }), 0);
        };

        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (menu.hidden) openMenu();
            else closeMenu();
        });

        scanAction.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            void scanPage();
        });

        document.addEventListener('pointerdown', event => {
            if (!container.contains(event.target)) closeMenu();
        }, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !menu.hidden) {
                closeMenu();
                button.focus({ preventScroll: true });
            }
        });

        const dragHandle = document.createElement('div');
        dragHandle.className = 'fbfr-drag-handle';
        dragHandle.textContent = '🌠';
        dragHandle.title = 'Drag to move';
        dragHandle.setAttribute('role', 'button');
        dragHandle.setAttribute('aria-label', 'Drag downloader menu');

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        dragHandle.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            const rect = container.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            dragHandle.setPointerCapture?.(event.pointerId);
        });
        dragHandle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const position = clampLauncherPosition(
                event.clientX - offsetX,
                event.clientY - offsetY,
                window.innerWidth,
                window.innerHeight,
                container.offsetWidth,
                container.offsetHeight
            );
            container.style.left = `${position.left}px`;
            container.style.top = `${position.top}px`;
            container.style.right = 'auto';
        });
        const finishDrag = () => {
            if (!dragging) return;
            dragging = false;
            const rect = container.getBoundingClientRect();
            try {
                localStorage.setItem('fbfr-original-ui-position', JSON.stringify({ left: rect.left, top: rect.top }));
            } catch (_) {
                // Position persistence is optional.
            }
        };
        dragHandle.addEventListener('pointerup', finishDrag);
        dragHandle.addEventListener('pointercancel', finishDrag);
        dragHandle.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
        });

        container.append(button, menu, dragHandle);
        document.body.appendChild(container);

        try {
            const saved = JSON.parse(localStorage.getItem('fbfr-original-ui-position') || 'null');
            if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
                const position = clampLauncherPosition(
                    saved.left,
                    saved.top,
                    window.innerWidth,
                    window.innerHeight,
                    container.offsetWidth,
                    container.offsetHeight
                );
                container.style.left = `${position.left}px`;
                container.style.top = `${position.top}px`;
                container.style.right = 'auto';
            }
        } catch (_) {
            // Use the default top-right position.
        }

        if (launcherResizeHandler) window.removeEventListener('resize', launcherResizeHandler);
        launcherResizeHandler = () => {
            if (container.style.right !== 'auto') return;
            const rect = container.getBoundingClientRect();
            const position = clampLauncherPosition(
                rect.left,
                rect.top,
                window.innerWidth,
                window.innerHeight,
                container.offsetWidth,
                container.offsetHeight
            );
            container.style.left = `${position.left}px`;
            container.style.top = `${position.top}px`;
        };
        window.addEventListener('resize', launcherResizeHandler);

        updateMainButtonIdle();
    }

    loadRetainedImages();
    addMainButton();
    startInlineDownloadMonitoring();
    new MutationObserver(addMainButton).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
