(function () {
  function colorNumber(value, fallback) {
    return /^#[\da-f]{6}$/i.test(String(value || ''))
      ? Number.parseInt(String(value).slice(1), 16)
      : fallback
  }

  window.CoursewareRuntime.define({
    runtimeApiVersion: 2,

    create: function (ctx) {
      if (ctx.renderMode !== 'phaser') {
        throw new Error('Phaser 基准运行时必须使用 renderMode=phaser')
      }

      var scene = ctx.phaser.scene
      var layer = scene.add.container(0, 0)
      ctx.phaser.overlay.add(layer)

      var state = {
        running: true,
        visible: true,
        impulse: 0,
        time: 0
      }
      var content = ctx.content.all()
      var accent = colorNumber(content.accentColor, 0x38bdf8)
      var panel = scene.add.graphics()
      var orbit = scene.add.graphics()
      var particles = scene.add.graphics()
      var title = scene.add.text(92, 146, content.panelTitle || '', {
        color: '#e0f2fe',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold'
      })
      var hint = scene.add.text(92, 184, content.instruction || '', {
        color: '#bae6fd',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        wordWrap: { width: 430 }
      })
      var status = scene.add.text(92, 474, content.readyStatus || '', {
        color: '#f8fafc',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '17px',
        fontStyle: 'bold'
      })
      var field = scene.add.zone(652, 344, 610, 330)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

      layer.add([panel, orbit, particles, title, hint, status, field])

      function drawBase() {
        panel.clear()
        panel.fillStyle(0x082f49, 0.94)
        panel.fillRoundedRect(62, 122, 1156, 432, 30)
        panel.lineStyle(2, accent, 0.82)
        panel.strokeRoundedRect(63, 123, 1154, 430, 29)
        panel.fillStyle(0x0c4a6e, 0.82)
        panel.fillRoundedRect(70, 134, 455, 408, 24)
        panel.fillStyle(0x020617, 0.7)
        panel.fillRoundedRect(544, 134, 662, 408, 24)
      }

      function drawFrame() {
        if (!state.visible) return
        var pulse = 1 + Math.sin(state.time * 0.004) * 0.06
        var angle = state.time * 0.0015 + state.impulse
        var centerX = 874
        var centerY = 338
        var radiusX = 245
        var radiusY = 118

        orbit.clear()
        orbit.lineStyle(3, accent, 0.5)
        orbit.strokeEllipse(centerX, centerY, radiusX * 2, radiusY * 2)
        orbit.lineStyle(1, 0x7dd3fc, 0.24)
        orbit.strokeEllipse(centerX, centerY, radiusX * 1.48, radiusY * 1.48)
        orbit.fillStyle(0xfef08a, 0.98)
        orbit.fillCircle(centerX, centerY, 36 * pulse)
        orbit.fillStyle(0x38bdf8, 1)
        orbit.fillCircle(
          centerX + Math.cos(angle) * radiusX,
          centerY + Math.sin(angle) * radiusY,
          25
        )

        particles.clear()
        for (var index = 0; index < 24; index += 1) {
          var particleAngle = angle * (1 + (index % 4) * 0.08) + index * 0.62
          var distance = 62 + (index % 6) * 26
          var alpha = 0.2 + ((index * 17) % 8) / 12
          particles.fillStyle(index % 2 === 0 ? 0x7dd3fc : 0xc4b5fd, alpha)
          particles.fillCircle(
            centerX + Math.cos(particleAngle) * distance,
            centerY + Math.sin(particleAngle * 0.83) * distance * 0.55,
            2 + (index % 3)
          )
        }
      }

      function onActivate(pointer) {
        if (!state.running || !state.visible) return
        var normalized = Math.max(-1, Math.min(1, (pointer.x - 874) / 300))
        state.impulse += 0.9 + normalized * 0.45
        status.setText((content.activatedStatus || '').replace('{direction}', normalized < 0 ? (content.leftLabel || '') : (content.rightLabel || '')))
        ctx.emit('phaser:impulse', { direction: normalized })
      }

      function onUpdate(_time, delta) {
        if (!state.running) return
        state.time += Math.min(delta, 50)
        state.impulse *= 0.992
        drawFrame()
      }

      drawBase()
      drawFrame()
      field.on('pointerdown', onActivate)
      scene.events.on('update', onUpdate)
      ctx.capture.waitUntil(Promise.resolve())

      return {
        resize: function () {
          drawBase()
          drawFrame()
        },
        setVisible: function (visible) {
          state.visible = visible
          layer.setVisible(visible)
          if (visible) field.setInteractive({ useHandCursor: true })
          else field.disableInteractive()
        },
        suspend: function () {
          state.running = false
        },
        resume: function () {
          state.running = true
        },
        prepareCapture: function () {
          state.time = 1800
          drawFrame()
        },
        destroy: function () {
          state.running = false
          field.off('pointerdown', onActivate)
          scene.events.off('update', onUpdate)
          layer.destroy(true)
        }
      }
    }
  })
})()
