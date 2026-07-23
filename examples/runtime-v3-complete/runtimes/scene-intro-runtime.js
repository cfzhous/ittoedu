CoursewareRuntime.define({
  runtimeApiVersion: 1,

  create: function (ctx) {
    var card = ctx.nodes.get('interactionCard')
    if (!card) throw new Error(ctx.content.get('missingBindingError'))

    var panel = document.createElement('section')
    var instruction = document.createElement('p')
    var feedback = document.createElement('p')
    var nextButton = document.createElement('button')

    panel.setAttribute('aria-label', ctx.content.get('panelAriaLabel'))
    Object.assign(panel.style, {
      position: 'absolute',
      left: '760px',
      top: '170px',
      width: '430px',
      minHeight: '250px',
      padding: '28px',
      border: '1px solid rgba(125, 211, 252, .65)',
      borderRadius: '26px',
      color: '#e0f2fe',
      background: 'rgba(8, 47, 73, .92)',
      boxShadow: '0 24px 70px rgba(2, 8, 23, .35)',
      pointerEvents: 'auto'
    })
    Object.assign(instruction.style, {
      margin: '0 0 20px',
      fontSize: '23px',
      fontWeight: '700',
      lineHeight: '1.55'
    })
    Object.assign(feedback.style, {
      minHeight: '50px',
      margin: '0 0 22px',
      color: '#bae6fd',
      fontSize: '16px',
      lineHeight: '1.6'
    })
    Object.assign(nextButton.style, {
      display: 'none',
      width: '100%',
      minHeight: '48px',
      border: '1px solid #7dd3fc',
      borderRadius: '14px',
      color: '#082f49',
      background: '#7dd3fc',
      font: '700 16px Microsoft YaHei, sans-serif',
      cursor: 'pointer',
      pointerEvents: 'auto'
    })
    instruction.textContent = ctx.content.get('instruction')
    nextButton.textContent = ctx.content.get('continueLabel')
    panel.append(instruction, feedback, nextButton)
    ctx.dom.overlay.append(panel)

    var ring = ctx.phaser.scene.add.graphics()
    ring.lineStyle(4, 0x38bdf8, 0.8)
    ring.strokeCircle(360, 350, 150)
    ctx.phaser.overlay.add(ring)

    var pulse = ctx.phaser.scene.tweens.add({
      targets: ring,
      alpha: { from: 0.25, to: 1 },
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.92, to: 1.08 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    })

    function showCompleted(messageKey) {
      feedback.textContent = ctx.content.get(messageKey)
      nextButton.style.display = 'block'
    }

    function activate() {
      var activations = Number(ctx.localState.get('activations') || 0) + 1
      ctx.localState.set('activations', activations)
      ctx.courseState.set('introExplored', true)
      ctx.phaser.scene.tweens.add({
        targets: card.root,
        angle: { from: -2, to: 2 },
        scaleX: { from: 0.98, to: 1.04 },
        scaleY: { from: 0.98, to: 1.04 },
        duration: 180,
        yoyo: true,
        repeat: 2
      })
      showCompleted('successMessage')
      ctx.emit('intro:complete', { activations: activations })
    }

    function continueCourse() {
      ctx.actions.nextScene()
    }

    card.root.setInteractive({ useHandCursor: true })
    card.root.on('pointerup', activate)
    nextButton.addEventListener('click', continueCourse)

    if (ctx.courseState.get('introExplored') === true) {
      showCompleted('alreadyCompleteMessage')
    }

    ctx.capture.waitUntil(Promise.resolve())

    return {
      destroy: function () {
        card.root.off('pointerup', activate)
        nextButton.removeEventListener('click', continueCourse)
        ctx.phaser.scene.tweens.killTweensOf(card.root)
        pulse.stop()
        panel.remove()
      }
    }
  }
})
