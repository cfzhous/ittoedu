(function () {
  function colorNumber(value, fallback) {
    return /^#[\da-f]{6}$/i.test(String(value || ''))
      ? Number.parseInt(String(value).slice(1), 16)
      : fallback
  }

  function textAt(content, path) {
    var current = content
    for (var index = 0; index < path.length; index += 1) {
      if (!current || typeof current !== 'object') return ''
      current = current[path[index]]
    }
    return typeof current === 'string' ? current : ''
  }

  window.CoursewareComponent.define({
    id: 'com.example.runtime-v3-global-controls',
    runtimeApiVersion: 3,

    create: function (ctx) {
      var mode = ctx.mode
      var props = ctx.props
      var width = ctx.width
      var height = ctx.height
      var destroyed = false
      var currentSceneId = ''
      var statusKey = 'ready'

      var panel = ctx.scene.add.graphics()
      var title = ctx.scene.add.text(22, 14, '', {
        color: '#e0f2fe',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold'
      })
      var status = ctx.scene.add.text(22, 42, '', {
        color: '#cbd5e1',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '12px'
      })
      ctx.root.add([panel, title, status])

      var buttonSpecs = [
        { key: 'previous', action: function () { return ctx.actions.previousScene() } },
        { key: 'replay', action: function () { return ctx.actions.replayScene() } },
        { key: 'next', action: function () { return ctx.actions.nextScene() } },
        { key: 'restart', action: function () { return ctx.actions.restartCourse() } }
      ]
      var buttons = buttonSpecs.map(function (spec) {
        var background = ctx.scene.add.rectangle(0, 0, 120, 42, 0x1e293b, 1)
          .setOrigin(0)
          .setStrokeStyle(1, 0x475569, 1)
          .setInteractive({ useHandCursor: true })
        var label = ctx.scene.add.text(0, 0, '', {
          color: '#f8fafc',
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          align: 'center'
        }).setOrigin(0.5)

        var onOver = function () {
          if (mode === 'preview' && props.enabled !== false) background.setAlpha(0.82)
        }
        var onOut = function () {
          background.setAlpha(props.enabled === false ? 0.45 : 1)
        }
        var onActivate = function () {
          if (destroyed || mode !== 'preview' || props.enabled === false) return
          var uses = 0
          if (ctx.courseState) {
            uses = Number(ctx.courseState.get('globalControls.uses') || 0) + 1
            ctx.courseState.set('globalControls.uses', uses)
          }
          statusKey = spec.key
          renderStatus()
          ctx.emit('control:used', {
            action: spec.key,
            scope: ctx.scope || 'scene',
            uses: uses
          })
          spec.action()
        }

        background.on('pointerover', onOver)
        background.on('pointerout', onOut)
        background.on('pointerup', onActivate)
        ctx.root.add([background, label])
        return {
          spec: spec,
          background: background,
          label: label,
          onOver: onOver,
          onOut: onOut,
          onActivate: onActivate
        }
      })

      var removeSceneListener = ctx.events
        ? ctx.events.on('scene:enter', function (event) {
            currentSceneId = event && typeof event.sceneId === 'string'
              ? event.sceneId
              : ''
            statusKey = 'sceneChanged'
            renderStatus()
          })
        : null

      function renderStatus() {
        var content = props.content && typeof props.content === 'object'
          ? props.content
          : {}
        var sceneName = textAt(content, ['sceneNames', currentSceneId])
        var count = ctx.courseState
          ? Number(ctx.courseState.get('globalControls.uses') || 0)
          : 0
        status.setText(
          textAt(content, ['status', statusKey])
            .replaceAll('{scene}', sceneName)
            .replaceAll('{count}', String(count))
        )
      }

      function render() {
        var content = props.content && typeof props.content === 'object'
          ? props.content
          : {}
        var accent = colorNumber(props.accent, 0x38bdf8)
        var background = colorNumber(props.background, 0x0f172a)
        var buttonBackground = colorNumber(props.buttonBackground, 0x1e293b)
        var enabled = props.enabled !== false

        panel.clear()
        panel.fillStyle(background, 0.96)
        panel.fillRoundedRect(0, 0, width, height, Math.min(18, height / 3))
        panel.lineStyle(2, accent, 0.75)
        panel.strokeRoundedRect(1, 1, width - 2, height - 2, Math.min(18, height / 3))

        title.setText(textAt(content, ['title']))
        renderStatus()

        var titleArea = Math.max(250, Math.min(360, width * 0.31))
        var gap = 10
        var available = Math.max(280, width - titleArea - 22)
        var buttonWidth = Math.max(68, (available - gap * 3) / 4)
        var buttonHeight = Math.max(40, height - 24)

        buttons.forEach(function (button, index) {
          var x = titleArea + index * (buttonWidth + gap)
          var y = (height - buttonHeight) / 2
          button.background
            .setPosition(x, y)
            .setSize(buttonWidth, buttonHeight)
            .setDisplaySize(buttonWidth, buttonHeight)
            .setFillStyle(buttonBackground, 1)
            .setStrokeStyle(1, accent, enabled ? 0.8 : 0.25)
            .setAlpha(enabled ? 1 : 0.45)
          button.label
            .setPosition(x + buttonWidth / 2, y + buttonHeight / 2)
            .setText(textAt(content, ['buttons', button.spec.key]))
            .setAlpha(enabled ? 1 : 0.55)
        })
      }

      render()

      return {
        setMode: function (nextMode) {
          mode = nextMode
        },
        resize: function (nextWidth, nextHeight) {
          width = nextWidth
          height = nextHeight
          render()
        },
        updateProps: function (nextProps) {
          props = nextProps
          render()
        },
        destroy: function () {
          if (destroyed) return
          destroyed = true
          buttons.forEach(function (button) {
            button.background.off('pointerover', button.onOver)
            button.background.off('pointerout', button.onOut)
            button.background.off('pointerup', button.onActivate)
          })
          if (removeSceneListener) removeSceneListener()
        }
      }
    }
  })
})()
