(function () {
  'use strict'

  window.CoursewareComponent.define({
    id: 'com.example.sample-counter',
    runtimeApiVersion: 2,

    create: function (ctx) {
      var mode = ctx.mode
      var value = normaliseValue(ctx.props.initialValue)
      var currentWidth = ctx.width
      var currentHeight = ctx.height

      var shadow = ctx.scene.add
        .rectangle(6, 8, currentWidth - 12, currentHeight - 12, 0x0f172a, 0.16)
        .setOrigin(0)
        .setRounded(18)

      var background = ctx.scene.add
        .rectangle(0, 0, currentWidth - 12, currentHeight - 12, 0xf8fafc)
        .setOrigin(0)
        .setRounded(18)
        .setStrokeStyle(2, 0xcbd5e1)

      var accent = ctx.scene.add
        .rectangle(0, 0, 10, currentHeight - 12, 0x2563eb)
        .setOrigin(0)

      var title = ctx.scene.add
        .text(30, 22, normaliseText(ctx.props.title, '课堂计数器'), {
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#0f172a'
        })
        .setOrigin(0)

      var hint = ctx.scene.add
        .text(30, 58, normaliseText(ctx.props.hint, '点击按钮改变数值'), {
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: '15px',
          color: '#64748b'
        })
        .setOrigin(0)

      var disposeTitleEditor = ctx.editor
        ? ctx.editor.registerTextRegion({
            key: 'title',
            label: '组件标题',
            maxLength: 24,
            getBounds: function () {
              return { x: 24, y: 14, width: Math.max(80, currentWidth - 48), height: 38 }
            }
          })
        : function () {}
      var disposeHintEditor = ctx.editor
        ? ctx.editor.registerTextRegion({
            key: 'hint',
            label: '操作提示',
            maxLength: 40,
            getBounds: function () {
              return { x: 24, y: 52, width: Math.max(80, currentWidth - 48), height: 30 }
            }
          })
        : function () {}

      var valueText = ctx.scene.add
        .text(currentWidth / 2, currentHeight / 2 - 6, String(value), {
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: '66px',
          fontStyle: 'bold',
          color: '#1d4ed8'
        })
        .setOrigin(0.5)

      var minusButton = makeButton(ctx, 0xef4444, '−')
      var resetButton = makeButton(ctx, 0x475569, '归零')
      var plusButton = makeButton(ctx, 0x2563eb, '+')

      function normaliseValue(input) {
        var number = Number(input)
        return Number.isFinite(number) ? number : 0
      }

      function normaliseText(input, fallback) {
        return typeof input === 'string' && input.trim() ? input : fallback
      }

      function refreshValue() {
        valueText.setText(String(value))
      }

      function changeValue(delta) {
        if (mode !== 'preview') return
        value += delta
        refreshValue()
        ctx.emit('change', { value: value })
      }

      function resetValue() {
        if (mode !== 'preview') return
        value = 0
        refreshValue()
        ctx.emit('change', { value: value })
      }

      function onMinus() {
        changeValue(-1)
      }

      function onPlus() {
        changeValue(1)
      }

      minusButton.background.on('pointerdown', onMinus)
      resetButton.background.on('pointerdown', resetValue)
      plusButton.background.on('pointerdown', onPlus)

      ctx.root.add([
        shadow,
        background,
        accent,
        title,
        hint,
        valueText,
        minusButton.background,
        minusButton.label,
        resetButton.background,
        resetButton.label,
        plusButton.background,
        plusButton.label
      ])

      function layout(width, height) {
        currentWidth = Math.max(160, width)
        currentHeight = Math.max(100, height)

        shadow.setSize(Math.max(16, currentWidth - 12), Math.max(16, currentHeight - 12))
        background.setSize(Math.max(16, currentWidth - 12), Math.max(16, currentHeight - 12))
        accent.setSize(10, Math.max(16, currentHeight - 12))

        var compact = currentHeight < 190
        title.setFontSize(compact ? 18 : 24)
        title.setPosition(30, compact ? 14 : 22)
        hint.setVisible(!compact)
        hint.setPosition(30, 58)

        valueText.setFontSize(compact ? 42 : 66)
        valueText.setPosition(currentWidth / 2, compact ? currentHeight / 2 - 12 : currentHeight / 2 - 6)

        var buttonWidth = Math.max(42, Math.min(104, (currentWidth - 76) / 3))
        var buttonHeight = compact ? 34 : 42
        var buttonY = currentHeight - (compact ? 28 : 42)
        var gap = Math.max(8, Math.min(16, (currentWidth - buttonWidth * 3) / 5))
        var centre = currentWidth / 2

        positionButton(minusButton, centre - buttonWidth - gap, buttonY, buttonWidth, buttonHeight)
        positionButton(resetButton, centre, buttonY, buttonWidth, buttonHeight)
        positionButton(plusButton, centre + buttonWidth + gap, buttonY, buttonWidth, buttonHeight)
      }

      layout(currentWidth, currentHeight)

      return {
        setMode: function (nextMode) {
          mode = nextMode
        },

        resize: function (width, height) {
          layout(width, height)
        },

        updateProps: function (nextProps) {
          if (Object.prototype.hasOwnProperty.call(nextProps, 'title')) {
            title.setText(normaliseText(nextProps.title, '课堂计数器'))
          }
          if (Object.prototype.hasOwnProperty.call(nextProps, 'hint')) {
            hint.setText(normaliseText(nextProps.hint, '点击按钮改变数值'))
          }
          if (Object.prototype.hasOwnProperty.call(nextProps, 'initialValue')) {
            value = normaliseValue(nextProps.initialValue)
            refreshValue()
          }
        },

        destroy: function () {
          disposeTitleEditor()
          disposeHintEditor()
          minusButton.background.off('pointerdown', onMinus)
          resetButton.background.off('pointerdown', resetValue)
          plusButton.background.off('pointerdown', onPlus)
        }
      }
    }
  })

  function makeButton(ctx, colour, text) {
    var background = ctx.scene.add
      .rectangle(0, 0, 96, 42, colour)
      .setOrigin(0.5)
      .setRounded(10)
      .setInteractive({ useHandCursor: true })

    var label = ctx.scene.add
      .text(0, 0, text, {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: text.length > 1 ? '16px' : '28px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5)

    return { background: background, label: label }
  }

  function positionButton(button, x, y, width, height) {
    button.background.setPosition(x, y).setSize(width, height)
    button.label.setPosition(x, y)
  }
})()
