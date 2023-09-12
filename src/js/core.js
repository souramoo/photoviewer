import $ from './domq.js';
import DEFAULTS from './defaults';
import {
  $W,
  $D,
  CLICK_EVENT,
  RESIZE_EVENT,
  KEYDOWN_EVENT,
  WHEEL_EVENT,
  NS,
  CLASS_NS,
  EVENT_NS,
  PUBLIC_VARS
} from './constants';
import {
  debounce,
  preloadImage,
  requestFullscreen,
  getImageNameFromUrl,
  setGrabCursor,
  isRootNode,
  getCSSValueSum,
  isBorderBox,
  getImageScale
} from './utilities';
import { draggable } from './draggable';
import { movable } from './movable';
import { resizable } from './resizable';

/**
 * PhotoViewer class
 */
class PhotoViewer {
  // Store modal instances
  static instances = [];

  // Whether modal opened
  isOpened = false;

  // Whether modal maximized
  isMaximized = false;

  // Whether image rotated (`90*(2n+1)`)
  isRotated = false;

  // Image rotation degree
  rotationDegree = 0;

  // Store image data in every instance
  imageData = {};

  // Store modal data in every instance
  modalData = {
    width: null,
    height: null,
    left: null,
    top: null
  };

  // Used for time comparison
  _lastTimestamp = 0;

  constructor(items, options) {
    this.init(items, options);
  }

  init(items, options) {
    this.options = $.extend(true, {}, DEFAULTS, options);

    if (options && $.isArray(options.footerToolbar)) {
      this.options.footerToolbar = options.footerToolbar;
    }
    if (options && $.isArray(options.headerToolbar)) {
      this.options.headerToolbar = options.headerToolbar;
    }

    // Reset public z-index with option
    PUBLIC_VARS['zIndex'] = PUBLIC_VARS['zIndex'] === 0 ? this.options['zIndex'] : PUBLIC_VARS['zIndex'];

    this.open();

    this.images = items;
    this.index = this.options['index'];
    this._loadImage(this.index);

    if (this.options.draggable) {
      this.draggable(this.$photoviewer, this.dragHandle, CLASS_NS + '-button');
    }
    if (this.options.movable) {
      this.movable(this.$stage, this.$image);
    }
    if (this.options.resizable) {
      this.resizable(this.$photoviewer, this.$stage, this.$image, this.options);
    }
  }

  _createBtns(toolbar) {
    const btns = [
      'minimize', 'maximize', 'close',
      'zoomIn', 'zoomOut', 'prev', 'next', 'fullscreen', 'actualSize', 'rotateLeft', 'rotateRight'
    ];
    let btnsHTML = '';

    $.each(toolbar, (index, item) => {
      const btnClass = `${NS}-button ${NS}-button-${item}`;

      if (btns.indexOf(item) >= 0) {
        btnsHTML +=
          `<button class="${btnClass}" title="${this.options.i18n[item]}">
          ${this.options.icons[item]}
          </button>`;
      } else if (this.options.customButtons[item]) {
        btnsHTML +=
          `<button class="${btnClass}" title="${this.options.customButtons[item].title || ''}">
          ${this.options.customButtons[item].text}
          </button>`;
      }
    });

    return btnsHTML;
  }

  _createTitle() {
    return this.options.title ? `<div class="${NS}-title"></div>` : '';
  }

  _createTemplate() {
    // PhotoViewer base HTML
    const photoviewerHTML =
      `<div class="${NS}-modal" tabindex="0">
        <div class="${NS}-inner">
          <div class="${NS}-header">
            <div class="${NS}-toolbar ${NS}-toolbar-header">
            ${this._createBtns(this.options.headerToolbar)}
            </div>
            ${this._createTitle()}
          </div>
          <div class="${NS}-stage">
            <img class="${NS}-image" src="" alt="" />
          </div>
          <div class="${NS}-footer">
            <div class="${NS}-toolbar ${NS}-toolbar-footer">
            ${this._createBtns(this.options.footerToolbar)}
            </div>
          </div>
        </div>
      </div>`;

    return photoviewerHTML;
  }

  _build() {
    // Create PhotoViewer HTML string
    const photoviewerHTML = this._createTemplate();

    // Make PhotoViewer HTML string to Domq element
    const $photoviewer = $(photoviewerHTML);

    // Get all PhotoViewer elements
    this.$photoviewer = $photoviewer;
    this.$stage = $photoviewer.find(CLASS_NS + '-stage');
    this.$title = $photoviewer.find(CLASS_NS + '-title');
    this.$image = $photoviewer.find(CLASS_NS + '-image');
    this.$close = $photoviewer.find(CLASS_NS + '-button-close');
    this.$maximize = $photoviewer.find(CLASS_NS + '-button-maximize');
    this.$minimize = $photoviewer.find(CLASS_NS + '-button-minimize');
    this.$zoomIn = $photoviewer.find(CLASS_NS + '-button-zoomIn');
    this.$zoomOut = $photoviewer.find(CLASS_NS + '-button-zoomOut');
    this.$actualSize = $photoviewer.find(CLASS_NS + '-button-actualSize');
    this.$fullscreen = $photoviewer.find(CLASS_NS + '-button-fullscreen');
    this.$rotateLeft = $photoviewer.find(CLASS_NS + '-button-rotateLeft');
    this.$rotateRight = $photoviewer.find(CLASS_NS + '-button-rotateRight');
    this.$prev = $photoviewer.find(CLASS_NS + '-button-prev');
    this.$next = $photoviewer.find(CLASS_NS + '-button-next');

    // Add class before image loaded
    this.$stage.addClass('stage-ready');
    this.$image.addClass('image-ready');

    // Reset modal `z-index` of multiple instances
    this.$photoviewer.css('z-index', PUBLIC_VARS['zIndex']);

    if (this.options.positionFixed) {
      this.$photoviewer.css({ position: 'fixed' });
    }

    // Set handle element of draggable
    if (!this.options.dragHandle || this.options.dragHandle === CLASS_NS + '-modal') {
      this.dragHandle = this.$photoviewer;
    } else {
      this.dragHandle = this.$photoviewer.find(this.options.dragHandle);
    }

    // Add PhotoViewer to DOM
    $(this.options.appendTo).eq(0).append(this.$photoviewer);

    // Store the edge value of stage
    this._stageEdgeValue = {
      horizontal: getCSSValueSum(this.$stage, ['left', 'right', 'border-left-width', 'border-right-width']),
      vertical: getCSSValueSum(this.$stage, ['top', 'bottom', 'border-top-width', 'border-bottom-width'])
    };

    // Store the edge value of modal
    this._modalEdgeValue = {
      horizontal: getCSSValueSum(this.$photoviewer, ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']),
      vertical: getCSSValueSum(this.$photoviewer, ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'])
    };

    this._addEvents();
    this._addCustomButtonEvents();
  }

  open() {
    this._triggerHook('beforeOpen', this);

    if (!this.options.multiInstances && PhotoViewer.instances.length > 0) {
      PhotoViewer.instances[0].close();
    }

    this._build();

    this._setInitModalPos();

    PhotoViewer.instances.push(this);

    this._triggerHook('opened', this);
  }

  close() {
    this._triggerHook('beforeClose', this);

    // Remove the DOM and all bound events
    this.$photoviewer.remove();

    PhotoViewer.instances = PhotoViewer.instances.filter(p => p !== this);

    if (PhotoViewer.instances.length === 0) {
      // Reset `z-index` after close
      PUBLIC_VARS['zIndex'] = this.options.zIndex;
      // Remove the bound event on windows
      $W.off(RESIZE_EVENT + EVENT_NS);
    }

    this._triggerHook('closed', this);
  }

  _getOffsetParentData() {
    const offsetParent = $(this.options.appendTo)[0];
    return {
      width: this.options.positionFixed || isRootNode(offsetParent) ? $W.width() : offsetParent.clientWidth,
      height: this.options.positionFixed || isRootNode(offsetParent) ? $W.height() : offsetParent.clientHeight,
      scrollLeft: this.options.positionFixed ? 0 : isRootNode(offsetParent) ? $D.scrollLeft() : offsetParent.scrollLeft,
      scrollTop: this.options.positionFixed ? 0 : isRootNode(offsetParent) ? $D.scrollTop() : offsetParent.scrollTop,
    };
  }

  _setModalToCenter() {
    let initLeft, initTop, initRight, initBottom;

    // Extra width/height for `content-box`
    let extraWidth = 0, extraHeight = 0;

    if (!isBorderBox(this.$photoviewer)) {
      extraWidth += this._modalEdgeValue.horizontal;
      extraHeight += this._modalEdgeValue.vertical;
    }

    if ($.isPlainObject(this.options.initModalPos)) {
      initLeft = this.options.initModalPos.left;
      initTop = this.options.initModalPos.top;
      initRight = this.options.initModalPos.right;
      initBottom = this.options.initModalPos.bottom;
    } else {
      const offsetParentData = this._getOffsetParentData();
      initLeft = (offsetParentData.width - this.options.modalWidth - extraWidth) / 2 + offsetParentData.scrollLeft;
      initTop = (offsetParentData.height - this.options.modalHeight - extraHeight) / 2 + offsetParentData.scrollTop;
    }

    const modalInitCSS = {
      width: (this.modalData.width || this.options.modalWidth),
      height: (this.modalData.height || this.options.modalHeight),
      left: (this.modalData.left || initLeft),
      top: (this.modalData.top || initTop),
      right: (this.modalData.right || initRight),
      bottom: (this.modalData.bottom || initBottom)
    };

    this.$photoviewer.css(modalInitCSS);
  }

  _setInitModalPos() {
    if (this.options.initMaximized) {
      this.maximize();

      this.isOpened = true;
    } else {
      this._setModalToCenter();
    }

    // The focus must be set after opening
    this.$photoviewer[0].focus();
  }

  _setModalSize() {
    const { originalWidth: imgOrigWidth, originalHeight: imgOrigHeight } = this.imageData;

    // Modal size should calculate with stage css value
    let modalWidth = imgOrigWidth + this._stageEdgeValue.horizontal;
    let modalHeight = imgOrigHeight + this._stageEdgeValue.vertical;

    // Extra width/height for `content-box`
    let extraWidth = 0, extraHeight = 0;

    if (isBorderBox(this.$photoviewer)) {
      modalWidth += this._modalEdgeValue.horizontal;
      modalHeight += this._modalEdgeValue.vertical;
    } else {
      extraWidth += this._modalEdgeValue.horizontal;
      extraHeight += this._modalEdgeValue.vertical;
    }

    const offsetParentData = this._getOffsetParentData();
    const gapThreshold = Math.max(this.options.gapThreshold, 0) + 1;
    // Modal scale relative to parent element
    const scale = Math.min(
      offsetParentData.width / ((modalWidth + extraWidth) * gapThreshold),
      offsetParentData.height / ((modalHeight + extraHeight) * gapThreshold),
      1
    );

    let minWidth = Math.max(modalWidth * scale, this.options.modalWidth);
    let minHeight = Math.max(modalHeight * scale, this.options.modalHeight);

    minWidth = this.options.fixedModalSize ? this.options.modalWidth : Math.round(minWidth);
    minHeight = this.options.fixedModalSize ? this.options.modalHeight : Math.round(minHeight);

    let transLeft, transTop, transRight, transBottom;

    if ($.isPlainObject(this.options.initModalPos)) {
      transLeft = this.options.initModalPos.left;
      transTop = this.options.initModalPos.top;
      transRight = this.options.initModalPos.right;
      transBottom = this.options.initModalPos.bottom;
    } else {
      transLeft = (offsetParentData.width - minWidth - extraWidth) / 2 + offsetParentData.scrollLeft;
      transTop = (offsetParentData.height - minHeight - extraHeight) / 2 + offsetParentData.scrollTop;
    }

    const modalTransCSS = {
      width: minWidth,
      height: minHeight,
      left: transLeft,
      top: transTop,
      right: transRight,
      bottom: transBottom
    };

    // Add init animation for modal
    if (this.options.initAnimation) {
      this.$photoviewer.animate(modalTransCSS, this.options.animationDuration, this.options.animationEasing, () => {
        this._setImageSize();
      });
    } else {
      this.$photoviewer.css(modalTransCSS);
      this._setImageSize();
    }

    this.isOpened = true;
  }

  _setImageSize() {
    const { originalWidth: imgOrigWidth, originalHeight: imgOrigHeight } = this.imageData;

    const stageData = {
      w: this.$stage.width(),
      h: this.$stage.height()
    };

    const scale = getImageScale(imgOrigWidth, imgOrigHeight, stageData.w, stageData.h, this.isRotated);

    this.$image.css({
      width: Math.round(imgOrigWidth * scale),
      height: Math.round(imgOrigHeight * scale),
      left: (stageData.w - Math.round(imgOrigWidth * scale)) / 2,
      top: (stageData.h - Math.round(imgOrigHeight * scale)) / 2
    });

    // Store image initial data
    $.extend(this.imageData, {
      initWidth: imgOrigWidth * scale,
      initHeight: imgOrigHeight * scale,
      initLeft: (stageData.w - imgOrigWidth * scale) / 2,
      initTop: (stageData.h - imgOrigHeight * scale) / 2,
      width: imgOrigWidth * scale,
      height: imgOrigHeight * scale,
      left: (stageData.w - imgOrigWidth * scale) / 2,
      top: (stageData.h - imgOrigHeight * scale) / 2
    });

    // Set grab cursor
    setGrabCursor(
      { w: this.$image.width(), h: this.$image.height() },
      { w: this.$stage.width(), h: this.$stage.height() },
      this.$stage,
      this.isRotated
    );

    // Just execute before image loaded
    if (!this.imageLoaded) {
      // Loader end
      this.$photoviewer.find(CLASS_NS + '-loader').remove();

      // Remove class after image loaded
      this.$stage.removeClass('stage-ready');
      this.$image.removeClass('image-ready');

      // Add init animation for image
      if (this.options.initAnimation && !this.options.progressiveLoading) {
        this.$image.fadeIn();
      }

      this.imageLoaded = true;
    }
  }

  _loadImage(index, fn, err) {
    const imgSrc = this.images[index]?.src;
    if (!imgSrc) return;

    // Reset image
    this.$image.removeAttr('style').attr('src', '');
    this.isRotated = false;
    this.rotationDegree = 0;

    this.imageLoaded = false;

    // Loader start
    this.$photoviewer.append(`<div class="${NS}-loader"></div>`);

    // Add class before image loaded
    this.$stage.addClass('stage-ready');
    this.$image.addClass('image-ready');

    if (this.options.initAnimation && !this.options.progressiveLoading) {
      this.$image.hide();
    }

    this.$image.attr('src', imgSrc);

    preloadImage(
      imgSrc,
      img => {
        // Store original image data
        this.imageData = {
          originalWidth: img.width,
          originalHeight: img.height
        };

        if (this.isMaximized || (this.isOpened && this.options.fixedModalPos)) {
          this._setImageSize();
        } else {
          this._setModalSize();
        }

        // Callback of image loaded successfully
        if (fn) {
          fn.call();
        }
      },
      () => {
        // Loader end
        this.$photoviewer.find(CLASS_NS + '-loader').remove();

        // Callback of image loading failed
        if (err) {
          err.call();
        }
      }
    );

    if (this.options.title && imgSrc) {
      this._setImageTitle(imgSrc);
    }
  }

  _setImageTitle(url) {
    const title = this.images[this.index].title || getImageNameFromUrl(url);
    this.$title.html(title);
  }

  jump(step) {
    this._triggerHook('beforeChange', [this, this.index]);

    // Make sure change image after the modal animation has finished
    const now = Date.now();
    if (now - this._lastTimestamp >= this.options.animationDuration) {
      this.index = this.index + step;

      this.jumpTo(this.index);

      this._lastTimestamp = now;
    }
  }

  jumpTo(index) {
    index = index % this.images.length;

    if (index >= 0) {
      index = index % this.images.length;
    } else if (index < 0) {
      index = (this.images.length + index) % this.images.length;
    }

    this.index = index;

    this._loadImage(
      index,
      () => {
        this._triggerHook('changed', [this, index]);
      },
      () => {
        this._triggerHook('changed', [this, index]);
      }
    );
  }

  _wheel(e) {
    e.preventDefault();

    let delta = 1;

    if (e.deltaY) {
      delta = e.deltaY > 0 ? 1 : -1;
    } else if (e.wheelDelta) {
      delta = -e.wheelDelta / 120;
    } else if (e.detail) {
      delta = e.detail > 0 ? 1 : -1;
    }

    // Ratio threshold
    const ratio = -delta * this.options.ratioThreshold;

    // Mouse point position relative to stage
    const pointer = {
      x: e.clientX - this.$stage.offset().left + $D.scrollLeft(),
      y: e.clientY - this.$stage.offset().top + $D.scrollTop()
    };

    this.zoom(ratio, pointer);
  }

  zoom(ratio, origin) {
    // Zoom out ratio & Zoom in ratio
    ratio = ratio < 0 ? 1 / (1 - ratio) : 1 + ratio;

    // Image ratio
    ratio = (this.$image.width() / this.imageData.originalWidth) * ratio;

    if (ratio > this.options.maxRatio || ratio < this.options.minRatio) {
      return;
    }

    this.zoomTo(ratio, origin);
  }

  zoomTo(ratio, origin) {
    const {
      originalWidth: imgOrigWidth,
      originalHeight: imgOrigHeight,
      width: imgWidth,
      height: imgHeight,
      left: imgLeft,
      top: imgTop,
      initWidth: imgInitWidth
    } = this.imageData;

    // Image stage position
    // We will use it to calc the relative position of image
    const stageData = {
      w: this.$stage.width(),
      h: this.$stage.height(),
      x: this.$stage.offset().left,
      y: this.$stage.offset().top
    };

    // Set default origin coordinates (center of stage)
    if (origin === void 0) {
      origin = {
        x: this.$stage.width() / 2,
        y: this.$stage.height() / 2
      };
    }

    // Get the new size of the image
    const newWidth = imgOrigWidth * ratio;
    const newHeight = imgOrigHeight * ratio;
    // Think about it for a while
    let newLeft = origin.x - ((origin.x - imgLeft) / imgWidth) * newWidth;
    let newTop = origin.y - ((origin.y - imgTop) / imgHeight) * newHeight;
    // δ is the difference between new width and new height of the image
    const δ = !this.isRotated ? 0 : (newWidth - newHeight) / 2;
    // The width and height should be exchanged after rotated
    const transWidth = !this.isRotated ? newWidth : newHeight;
    const transHeight = !this.isRotated ? newHeight : newWidth;
    // The difference between stage size and new image size
    const diffX = stageData.w - newWidth;
    const diffY = stageData.h - newHeight;
    // Zoom-out & Zoom-in condition
    // It's important and it takes me a lot of time to get it
    // The conditions with image rotated 90 degree drive me crazy alomst!
    if (transWidth <= stageData.w) {
      newLeft = diffX / 2;
    } else {
      newLeft = newLeft > -δ ? -δ : Math.max(newLeft, diffX + δ);
    }
    if (transHeight <= stageData.h) {
      newTop = diffY / 2;
    } else {
      newTop = newTop > δ ? δ : Math.max(newTop, diffY - δ);
    }

    // Whether the image scale get to the critical point
    if (Math.abs(imgInitWidth - newWidth) < imgInitWidth * 0.05) {
      this._setImageSize();
    } else {
      this.$image.css({
        width: Math.round(newWidth),
        height: Math.round(newHeight),
        left: Math.round(newLeft),
        top: Math.round(newTop)
      });

      // Set grab cursor
      setGrabCursor(
        { w: Math.round(transWidth), h: Math.round(transHeight) },
        { w: stageData.w, h: stageData.h },
        this.$stage
      );
    }

    // Update image initial data
    $.extend(this.imageData, {
      width: newWidth,
      height: newHeight,
      left: newLeft,
      top: newTop
    });
  }

  rotate(degree) {
    this.rotationDegree = this.rotationDegree + degree;

    if ((this.rotationDegree / 90) % 2 === 0) {
      this.isRotated = false;
    } else {
      this.isRotated = true;
    }

    this.rotateTo(this.rotationDegree);
  }

  rotateTo(degree) {
    this.$image.css({
      transform: 'rotate(' + degree + 'deg)'
    });

    this._setImageSize();
  }

  maximize() {
    this.$photoviewer.addClass(NS + '-maximized');

    this.$photoviewer.css({
      width: 'auto',
      height: 'auto',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    });

    this.isMaximized = true;
  }

  exitMaximize() {
    this.$photoviewer.removeClass(NS + '-maximized');

    this._setModalToCenter();

    this.isMaximized = false;
  }

  toggleMaximize() {
    if (!this.isMaximized) {
      let originalWidth = this.$photoviewer.width();
      let originalHeight = this.$photoviewer.height();

      if (isBorderBox(this.$photoviewer)) {
        originalWidth += this._modalEdgeValue.horizontal;
        originalHeight += this._modalEdgeValue.vertical;
      }

      // Store modal's size and position before maximized
      this.modalData = {
        width: originalWidth,
        height: originalHeight,
        left: parseFloat(this.$photoviewer.css('left')),
        top: parseFloat(this.$photoviewer.css('top'))
      };

      this.maximize();
    } else {
      this.exitMaximize();
    }

    this._setImageSize();

    this.$photoviewer[0].focus();
  }

  fullscreen() {
    requestFullscreen(this.$photoviewer[0]);

    this.$photoviewer[0].focus();
  }

  resize() {
    if (this.isOpened) {
      if (this.isMaximized) {
        this._setImageSize();
      } else {
        this._setModalSize();
      }
    }
  }

  _keydown(e) {
    if (!this.options.keyboard) {
      return false;
    }

    e.preventDefault();

    const keyCode = e.keyCode || e.which || e.charCode;
    const ctrlKey = e.ctrlKey || e.metaKey;
    const altKey = e.altKey;

    switch (keyCode) {
      // ←
      case 37:
        this.jump(-1);
        break;
      // →
      case 39:
        this.jump(1);
        break;
      // +
      case 187:
        this.zoom(
          this.options.ratioThreshold * 3,
          { x: this.$stage.width() / 2, y: this.$stage.height() / 2 },
          e
        );
        break;
      // -
      case 189:
        this.zoom(
          -this.options.ratioThreshold * 3,
          { x: this.$stage.width() / 2, y: this.$stage.height() / 2 },
          e
        );
        break;
      // + Firefox
      case 61:
        this.zoom(
          this.options.ratioThreshold * 3,
          { x: this.$stage.width() / 2, y: this.$stage.height() / 2 },
          e
        );
        break;
      // - Firefox
      case 173:
        this.zoom(
          -this.options.ratioThreshold * 3,
          { x: this.$stage.width() / 2, y: this.$stage.height() / 2 },
          e
        );
        break;
      // Ctrl + Alt + 0
      case 48:
        if (ctrlKey && altKey) {
          this.zoomTo(
            1,
            { x: this.$stage.width() / 2, y: this.$stage.height() / 2 },
            e
          );
        }
        break;
      // Ctrl + ,
      case 188:
        if (ctrlKey) {
          this.rotate(-90);
        }
        break;
      // Ctrl + .
      case 190:
        if (ctrlKey) {
          this.rotate(90);
        }
        break;
      // Q
      case 81:
        this.close();
        break;
      // Alt + X
      case 88:
        if (altKey) {
          this.toggleMaximize();
        }
        break;
      // F
      case 70:
        this.fullscreen();
        break;
      default:
    }
  }

  _addEvents() {
    this.$close.on(CLICK_EVENT + EVENT_NS, () => {
      this.close();
    });

    this.$stage.on(WHEEL_EVENT + EVENT_NS, e => {
      this._wheel(e);
    });

    this.$zoomIn.on(CLICK_EVENT + EVENT_NS, () => {
      this.zoom(this.options.ratioThreshold * 3);
    });

    this.$zoomOut.on(CLICK_EVENT + EVENT_NS, () => {
      this.zoom(-this.options.ratioThreshold * 3);
    });

    this.$actualSize.on(CLICK_EVENT + EVENT_NS, () => {
      this.zoomTo(1);
    });

    this.$prev.on(CLICK_EVENT + EVENT_NS, () => {
      this.jump(-1);
    });

    this.$fullscreen.on(CLICK_EVENT + EVENT_NS, () => {
      this.fullscreen();
    });

    this.$next.on(CLICK_EVENT + EVENT_NS, () => {
      this.jump(1);
    });

    this.$rotateLeft.on(CLICK_EVENT + EVENT_NS, () => {
      this.rotate(-90);
    });

    this.$rotateRight.on(CLICK_EVENT + EVENT_NS, () => {
      this.rotate(90);
    });

    this.$maximize.on(CLICK_EVENT + EVENT_NS, () => {
      this.toggleMaximize();
    });

    this.$photoviewer.on(KEYDOWN_EVENT + EVENT_NS, e => {
      this._keydown(e);
    });

    $W.on(RESIZE_EVENT + EVENT_NS, debounce(() => this.resize(), 500));
  }

  _addCustomButtonEvents() {
    for (const btnKey in this.options.customButtons) {
      this.$photoviewer.find(CLASS_NS + '-button-' + btnKey).on(CLICK_EVENT + EVENT_NS, e => {
        this.options.customButtons[btnKey].click.apply(this, [this, e]);
      });
    }
  }

  _triggerHook(e, data) {
    if (this.options.callbacks[e]) {
      this.options.callbacks[e].apply(this, $.isArray(data) ? data : [data]);
    }
  }
}

/**
 * Add methods to PhotoViewer
 */
$.extend(PhotoViewer.prototype, { draggable }, { movable }, { resizable });

export default PhotoViewer;
