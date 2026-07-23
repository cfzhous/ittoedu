CoursewareRuntime.define({
  runtimeApiVersion: 1,

  create: function (ctx) {
    var panel = document.createElement('section')
    var prompt = document.createElement('h2')
    var options = document.createElement('div')
    var feedback = document.createElement('p')
    var continueButton = document.createElement('button')

    panel.setAttribute('aria-label', ctx.content.get('panelAriaLabel'))
    Object.assign(panel.style, {
      position: 'absolute',
      left: '155px',
      top: '150px',
      width: '970px',
      minHeight: '390px',
      padding: '34px 42px',
      border: '1px solid rgba(196, 181, 253, .7)',
      borderRadius: '30px',
      color: '#f5f3ff',
      background: 'linear-gradient(145deg, rgba(46, 16, 101, .95), rgba(30, 41, 59, .95))',
      boxShadow: '0 28px 80px rgba(15, 23, 42, .4)',
      pointerEvents: 'auto'
    })
    Object.assign(prompt.style, {
      margin: '0 0 26px',
      fontSize: '30px',
      lineHeight: '1.45',
      textAlign: 'center'
    })
    Object.assign(options.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '18px'
    })
    Object.assign(feedback.style, {
      minHeight: '58px',
      margin: '26px 0 18px',
      color: '#ddd6fe',
      fontSize: '17px',
      lineHeight: '1.6',
      textAlign: 'center'
    })
    Object.assign(continueButton.style, {
      display: 'none',
      width: '260px',
      minHeight: '48px',
      margin: '0 auto',
      border: '1px solid #c4b5fd',
      borderRadius: '14px',
      color: '#2e1065',
      background: '#c4b5fd',
      font: '700 16px Microsoft YaHei, sans-serif',
      cursor: 'pointer',
      pointerEvents: 'auto'
    })

    prompt.textContent = ctx.content.get('prompt')
    continueButton.textContent = ctx.content.get('continueLabel')
    panel.append(prompt, options, feedback, continueButton)
    ctx.dom.overlay.append(panel)

    var optionDefinitions = [
      { key: 'optionA', correct: false },
      { key: 'optionB', correct: true },
      { key: 'optionC', correct: false }
    ]
    var optionButtons = optionDefinitions.map(function (definition) {
      var button = document.createElement('button')
      button.textContent = ctx.content.get(definition.key)
      Object.assign(button.style, {
        minHeight: '108px',
        padding: '16px',
        border: '1px solid rgba(196, 181, 253, .65)',
        borderRadius: '18px',
        color: '#f5f3ff',
        background: 'rgba(76, 29, 149, .72)',
        font: '700 19px/1.45 Microsoft YaHei, sans-serif',
        cursor: 'pointer',
        pointerEvents: 'auto'
      })

      var select = function () {
        var attempts = Number(ctx.localState.get('attempts') || 0) + 1
        ctx.localState.set('attempts', attempts)
        if (definition.correct) {
          ctx.courseState.set('challengePassed', true)
          feedback.textContent = ctx.content.get('correctFeedback')
          continueButton.style.display = 'block'
          optionButtons.forEach(function (entry) { entry.button.disabled = true })
          ctx.emit('challenge:passed', { attempts: attempts })
          return
        }
        feedback.textContent = ctx.content
          .get('wrongFeedbackTemplate')
          .replace('{attempts}', String(attempts))
      }

      button.addEventListener('click', select)
      options.append(button)
      return { button: button, select: select }
    })

    function continueCourse() {
      ctx.actions.nextScene()
    }
    continueButton.addEventListener('click', continueCourse)

    if (ctx.courseState.get('challengePassed') === true) {
      feedback.textContent = ctx.content.get('alreadyPassedFeedback')
      continueButton.style.display = 'block'
      optionButtons.forEach(function (entry) { entry.button.disabled = true })
    } else {
      feedback.textContent = ctx.content.get('initialFeedback')
    }

    ctx.capture.waitUntil(document.fonts ? document.fonts.ready : Promise.resolve())

    return {
      destroy: function () {
        optionButtons.forEach(function (entry) {
          entry.button.removeEventListener('click', entry.select)
        })
        continueButton.removeEventListener('click', continueCourse)
        panel.remove()
      }
    }
  }
})
