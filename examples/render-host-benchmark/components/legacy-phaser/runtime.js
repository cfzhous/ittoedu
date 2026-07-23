(function () {
  function valueAt(content, key) {
    return content && typeof content[key] === 'string' ? content[key] : ''
  }

  function colorNumber(value, fallback) {
    return /^#[\da-f]{6}$/i.test(String(value || ''))
      ? Number.parseInt(String(value).slice(1), 16)
      : fallback
  }

  window.CoursewareComponent.define({
    id: 'com.example.render-host-legacy-phaser',
    runtimeApiVersion: 3,

    create: function (ctx) {
      var props = ctx.props
      var mode = ctx.mode
      var width = ctx.width
      var height = ctx.height
      var count = 0
      var angle = -1.15
      var panel = ctx.scene.add.graphics()
      var dial = ctx.scene.add.graphics()
      var needle = ctx.scene.add.graphics()
      var title = ctx.scene.add.text(0, 0, '', {
        color: '#fef3c7',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '25px',
        fontStyle: 'bold'
      }).setOrigin(0.5, 0)
      var instruction = ctx.scene.add.text(0, 0, '', {
        color: '#ddd6fe',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        align: 'center',
        wordWrap: { width: 500 }
      }).setOrigin(0.5, 0)
      var centerLabel = ctx.scene.add.text(0, 0, '', {
        color: '#ffffff',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      var status = ctx.scene.add.text(0, 0, '', {
        color: '#fde68a',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        align: 'center'
      }).setOrigin(0.5, 0)
      var hit = ctx.scene.add.zone(0, 0, 260, 220)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

      ctx.root.add([panel, dial, needle, title, instruction, centerLabel, status, hit])

      function content() {
        return props && props.content && typeof props.content === 'object'
          ? props.content
          : {}
      }

      function draw() {
        var values = content()
        var accent = colorNumber(props.accent, 0xf59e0b)
        var background = colorNumber(props.background, 0x1e1b4b)
        var centerX = width / 2
        var centerY = height * 0.58
        var radius = Math.min(width * 0.21, height * 0.28)

        panel.clear()
        panel.fillStyle(background, 0.96)
        panel.fillRoundedRect(0, 0, width, height, 26)
        panel.lineStyle(2, accent, 0.82)
        panel.strokeRoundedRect(1, 1, width - 2, height - 2, 25)

        dial.clear()
        dial.fillStyle(0x0f172a, 0.92)
        dial.fillCircle(centerX, centerY, radius)
        dial.lineStyle(8, accent, 0.82)
        dial.beginPath()
        dial.arc(centerX, centerY, radius - 7, Math.PI * 1.08, Math.PI * 1.92)
        dial.strokePath()
        for (var index = 0; index < 9; index += 1) {
          var tickAngle = Math.PI * 1.08 + index * (Math.PI * 0.84 / 8)
          dial.lineStyle(index % 2 === 0 ? 3 : 1, 0xfef3c7, 0.8)
          dial.beginPath()
          dial.moveTo(
            centerX + Math.cos(tickAngle) * (radius - 25),
            centerY + Math.sin(tickAngle) * (radius - 25)
          )
          dial.lineTo(
            centerX + Math.cos(tickAngle) * (radius - 8),
            centerY + Math.sin(tickAngle) * (radius - 8)
          )
          dial.strokePath()
        }

        needle.clear()
        needle.lineStyle(5, 0xfef08a, 1)
        needle.beginPath()
        needle.moveTo(centerX, centerY)
        needle.lineTo(
          centerX + Math.cos(angle) * (radius - 34),
          centerY + Math.sin(angle) * (radius - 34)
        )
        needle.strokePath()
        needle.fillStyle(accent, 1)
        needle.fillCircle(centerX, centerY, 15)

        title.setPosition(centerX, 24).setText(valueAt(values, 'title'))
        instruction.setPosition(centerX, 64).setText(valueAt(values, 'instruction'))
        centerLabel.setPosition(centerX, centerY).setText(valueAt(values, 'centerLabel'))
        status.setPosition(centerX, height - 44)
        if (count === 0) status.setText(valueAt(values, 'readyStatus'))
        hit.setPosition(centerX, centerY).setSize(radius * 2, radius * 2)
      }

      function onActivate(pointer) {
        if (mode !== 'preview') return
        count += 1
        angle = Math.atan2(pointer.y - hit.y, pointer.x - hit.x)
        angle = Math.max(-Math.PI * 0.92, Math.min(-Math.PI * 0.08, angle))
        draw()
        status.setText(valueAt(content(), 'activatedStatusTemplate').replace('{count}', String(count)))
        ctx.emit('legacy-meter:activated', { count: count })
      }

      hit.on('pointerdown', onActivate)
      draw()

      return {
        setMode: function (nextMode) {
          mode = nextMode
        },
        resize: function (nextWidth, nextHeight) {
          width = nextWidth
          height = nextHeight
          draw()
        },
        updateProps: function (nextProps) {
          props = nextProps
          draw()
        },
        destroy: function () {
          hit.off('pointerdown', onActivate)
        }
      }
    }
  })
})()
