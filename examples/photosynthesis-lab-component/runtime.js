(function () {
  'use strict'

  var FONT = '"Microsoft YaHei", "PingFang SC", sans-serif'
  var BASE_W = 1080
  var BASE_H = 460

  window.CoursewareComponent.define({
    id: 'com.alepha.photosynthesis-lab',
    runtimeApiVersion: 4,

    create: function (ctx) {
      if (ctx.renderMode !== 'phaser') {
        throw new Error('光合作用互动实验室需要 Component API 4 Phaser 渲染面')
      }
      var scene = ctx.phaser.scene
      var root = ctx.phaser.root
      var mode = ctx.mode
      var page = normalisePage(ctx.props.page)
      var stage = scene.add.container(0, 0)
      var disposers = []
      var ownedTweens = []
      root.add(stage)

      function add(object) {
        stage.add(object)
        return object
      }

      function listen(object, event, handler) {
        object.on(event, handler)
        disposers.push(function () { object.off(event, handler) })
      }

      function tween(config) {
        var value = scene.tweens.add(config)
        ownedTweens.push(value)
        return value
      }

      function clear() {
        disposers.splice(0).forEach(function (dispose) { dispose() })
        ownedTweens.splice(0).forEach(function (item) { item.stop(); item.remove() })
        stage.removeAll(true)
      }

      function panel(x, y, width, height, colour, alpha, radius, stroke, strokeAlpha) {
        var shape = scene.add.rectangle(x, y, width, height, colour, alpha).setOrigin(0)
        if (radius) shape.setRounded(radius)
        if (stroke !== undefined) shape.setStrokeStyle(1, stroke, strokeAlpha === undefined ? 1 : strokeAlpha)
        return add(shape)
      }

      function label(x, y, value, size, colour, bold, originX, originY) {
        return add(scene.add.text(x, y, value, {
          fontFamily: FONT,
          fontSize: size + 'px',
          fontStyle: bold ? 'bold' : 'normal',
          color: colour,
          lineSpacing: 7,
          align: 'center'
        }).setOrigin(originX === undefined ? 0 : originX, originY === undefined ? 0 : originY))
      }

      function makeButton(x, y, width, height, textValue, colour, onPress) {
        var background = panel(x - width / 2, y - height / 2, width, height, colour, 1, 12, 0xffffff, 0.12)
          .setInteractive({ useHandCursor: true })
        var text = label(x, y, textValue, 17, '#ffffff', true, 0.5, 0.5)
        listen(background, 'pointerover', function () {
          if (mode === 'preview') background.setScale(1.035)
        })
        listen(background, 'pointerout', function () { background.setScale(1) })
        listen(background, 'pointerdown', function () {
          if (mode !== 'preview') return
          tween({ targets: [background, text], scaleX: 0.94, scaleY: 0.94, yoyo: true, duration: 90 })
          onPress()
        })
        return { background: background, text: text }
      }

      function glowDot(x, y, colour) {
        var outer = add(scene.add.circle(x, y, 12, colour, 0.12))
        var inner = add(scene.add.circle(x, y, 5, colour, 0.9))
        tween({ targets: outer, scale: 1.8, alpha: 0, duration: 1300, repeat: -1, ease: 'Sine.easeOut' })
        return { outer: outer, inner: inner }
      }

      function buildFrame(kicker, instruction, accent) {
        panel(0, 0, BASE_W, BASE_H, 0x07172b, 0.98, 28, accent, 0.32)
        panel(1, 1, BASE_W - 2, 6, accent, 0.9, 3)
        label(28, 22, kicker, 13, '#8fa8c7', true)
        label(28, 47, instruction, 18, '#eef7ff', true)
        label(1038, 28, '●  LIVE LAB', 12, '#69f0ae', true, 1, 0)
      }

      function buildPageOne() {
        buildFrame('01  ·  发现能量路径', '依次启动 3 种输入，观察叶片如何制造养分', 0x36d399)
        var active = { light: false, water: false, co2: false }
        var chips = []
        var dots = []

        panel(28, 92, 250, 330, 0x0d2637, 0.86, 22, 0x2dd4bf, 0.18)
        label(52, 112, '能量与原料', 14, '#80a7bd', true)
        label(52, 139, '点击启动输入', 12, '#55788d', false)

        var definitions = [
          { key: 'light', icon: '☀', name: '阳光', desc: '提供能量', colour: 0xfbbf24, y: 203 },
          { key: 'water', icon: '◆', name: '水', desc: '由根部吸收', colour: 0x38bdf8, y: 283 },
          { key: 'co2', icon: 'CO₂', name: '二氧化碳', desc: '由气孔进入', colour: 0xa78bfa, y: 363 }
        ]

        definitions.forEach(function (item, index) {
          var bg = panel(48, item.y - 28, 210, 58, 0x133246, 1, 16, item.colour, 0.28)
            .setInteractive({ useHandCursor: true })
          var icon = label(76, item.y, item.icon, item.key === 'co2' ? 15 : 23, colourString(item.colour), true, 0.5, 0.5)
          var name = label(103, item.y - 15, item.name, 17, '#f4fbff', true)
          var desc = label(103, item.y + 8, item.desc, 11, '#7da0b4', false)
          var dot = add(scene.add.circle(236, item.y, 5, 0x335267, 1))
          chips.push({ bg: bg, icon: icon, name: name, desc: desc })
          dots.push(dot)
          listen(bg, 'pointerover', function () { if (mode === 'preview' && !active[item.key]) bg.setFillStyle(0x19435a) })
          listen(bg, 'pointerout', function () { if (!active[item.key]) bg.setFillStyle(0x133246) })
          listen(bg, 'pointerdown', function () { activate(item, index) })
        })

        panel(302, 92, 464, 330, 0x0a2130, 0.72, 22, 0x22c55e, 0.15)
        var halo = add(scene.add.circle(534, 254, 126, 0x22c55e, 0.045))
        add(scene.add.circle(534, 254, 92, 0x22c55e, 0.055))
        tween({ targets: halo, scale: 1.08, alpha: 0.09, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' })
        var stem = panel(529, 253, 10, 112, 0x34d399, 1, 5)
        stem.setRotation(-0.02)
        var leafLeft = add(scene.add.ellipse(483, 252, 118, 68, 0x16a765, 1).setRotation(-0.42).setStrokeStyle(2, 0x6ee7b7, 0.55))
        var leafRight = add(scene.add.ellipse(585, 235, 132, 76, 0x22c973, 1).setRotation(0.38).setStrokeStyle(2, 0x86efac, 0.55))
        add(scene.add.line(0, 0, 449, 269, 537, 249, 0xa7f3d0, 0.58).setOrigin(0))
        add(scene.add.line(0, 0, 537, 249, 635, 252, 0xa7f3d0, 0.58).setOrigin(0))
        label(534, 376, '叶绿体 · 能量转换中心', 13, '#8ed9b8', true, 0.5, 0.5)
        var reaction = label(534, 116, '等待输入…', 14, '#65899c', true, 0.5, 0.5)

        panel(790, 92, 262, 330, 0x0d2637, 0.86, 22, 0xfbbf24, 0.16)
        label(814, 112, '制造成果', 14, '#90a8bd', true)
        var outputOxygen = panel(812, 166, 218, 82, 0x123046, 0.52, 18, 0x38bdf8, 0.14)
        var outputSugar = panel(812, 268, 218, 82, 0x123046, 0.52, 18, 0xfbbf24, 0.14)
        var oxygenIcon = label(850, 207, 'O₂', 24, '#3e6175', true, 0.5, 0.5)
        var oxygenLabel = label(888, 192, '氧气', 17, '#55798d', true)
        var oxygenDesc = label(888, 218, '释放到空气中', 11, '#46687a', false)
        var sugarIcon = label(850, 309, '⬡', 29, '#715f36', true, 0.5, 0.5)
        var sugarLabel = label(888, 294, '葡萄糖', 17, '#766c4b', true)
        var sugarDesc = label(888, 320, '储存化学能', 11, '#675f45', false)
        var success = label(921, 389, '3 / 3  尚未完成', 12, '#607f91', true, 0.5, 0.5)

        function activate(item, index) {
          if (mode !== 'preview' || active[item.key]) return
          active[item.key] = true
          chips[index].bg.setFillStyle(item.colour, 0.18).setStrokeStyle(2, item.colour, 0.88)
          dots[index].setFillStyle(item.colour).setScale(1.35)
          chips[index].desc.setColor(colourString(item.colour))
          reaction.setText('正在吸收' + item.name + '…').setColor(colourString(item.colour))
          var particle = add(scene.add.circle(258, item.y, 8, item.colour, 0.96))
          tween({
            targets: particle,
            x: 520,
            y: 252,
            scale: 0.25,
            duration: 720,
            ease: 'Cubic.easeIn',
            onComplete: function () {
              particle.destroy()
              tween({ targets: [leafLeft, leafRight], scale: 1.06, yoyo: true, duration: 220 })
              checkComplete()
            }
          })
          ctx.emit('input-activated', { input: item.key })
        }

        function checkComplete() {
          var count = Object.keys(active).filter(function (key) { return active[key] }).length
          success.setText(count + ' / 3  ' + (count === 3 ? '反应已启动' : '继续探索'))
          if (count !== 3) return
          reaction.setText('光合作用正在发生！').setColor('#6ee7b7')
          outputOxygen.setFillStyle(0x0d4965, 0.92).setStrokeStyle(2, 0x38bdf8, 0.78)
          outputSugar.setFillStyle(0x493d13, 0.78).setStrokeStyle(2, 0xfbbf24, 0.72)
          oxygenIcon.setColor('#7dd3fc'); oxygenLabel.setColor('#e0f7ff'); oxygenDesc.setColor('#8cc7dc')
          sugarIcon.setColor('#fcd34d'); sugarLabel.setColor('#fff6cb'); sugarDesc.setColor('#d5bd78')
          success.setColor('#6ee7b7')
          for (var i = 0; i < 8; i += 1) {
            var bubble = add(scene.add.circle(820 + (i % 4) * 32, 250 - (i % 3) * 7, 4 + (i % 3), 0x7dd3fc, 0.76))
            tween({ targets: bubble, y: 120 - (i % 2) * 18, alpha: 0, duration: 1300 + i * 95, repeat: -1, delay: i * 110 })
          }
          tween({ targets: halo, alpha: 0.2, scale: 1.24, duration: 500, yoyo: true })
          ctx.emit('completed', { page: 1 })
        }
      }

      function buildPageTwo() {
        buildFrame('02  ·  光合实验室', '调节环境参数，让光合效率进入“最佳区间”', 0x38bdf8)
        var state = { light: 65, co2: 55, temp: 22 }
        var controls = []

        panel(28, 92, 390, 330, 0x0d2637, 0.9, 22, 0x38bdf8, 0.18)
        label(52, 112, '实验参数', 14, '#85acc2', true)
        label(392, 115, '可连续调节', 11, '#4c7187', false, 1, 0)
        var rows = [
          { key: 'light', name: '光照强度', unit: '%', colour: 0xfbbf24, y: 190, step: 10, min: 0, max: 100 },
          { key: 'co2', name: 'CO₂ 浓度', unit: '%', colour: 0xa78bfa, y: 274, step: 10, min: 0, max: 100 },
          { key: 'temp', name: '环境温度', unit: '°C', colour: 0x38bdf8, y: 358, step: 3, min: 4, max: 40 }
        ]

        rows.forEach(function (row) {
          label(54, row.y - 30, row.name, 13, '#b7cede', true)
          var track = panel(54, row.y + 13, 238, 8, 0x1c4054, 1, 4)
          var fill = panel(54, row.y + 13, 120, 8, row.colour, 0.92, 4)
          var value = label(344, row.y - 4, '', 17, colourString(row.colour), true, 0.5, 0.5)
          makeButton(317, row.y + 18, 36, 32, '−', 0x17394d, function () { change(row, -row.step) })
          makeButton(371, row.y + 18, 36, 32, '+', 0x17394d, function () { change(row, row.step) })
          controls.push({ row: row, track: track, fill: fill, value: value })
        })

        panel(442, 92, 610, 330, 0x091f2e, 0.9, 22, 0x22c55e, 0.14)
        label(468, 112, '实时观测舱', 14, '#86a9bc', true)
        var chamber = panel(470, 150, 330, 238, 0x0c2e3b, 0.72, 24, 0x67e8f9, 0.18)
        var sun = add(scene.add.circle(525, 204, 28, 0xfbbf24, 0.9))
        var sunHalo = add(scene.add.circle(525, 204, 44, 0xfbbf24, 0.08))
        tween({ targets: sunHalo, scale: 1.2, alpha: 0.02, yoyo: true, repeat: -1, duration: 1200 })
        panel(490, 348, 288, 19, 0x214e3d, 1, 9)
        panel(622, 269, 9, 90, 0x42d392, 1, 4)
        var leafA = add(scene.add.ellipse(586, 286, 94, 51, 0x20b96c).setRotation(-0.38))
        var leafB = add(scene.add.ellipse(665, 271, 105, 57, 0x32d17e).setRotation(0.36))
        var bubbles = []
        for (var b = 0; b < 14; b += 1) {
          var bubble = add(scene.add.circle(687 + (b % 4) * 20, 330 - (b % 5) * 16, 4 + (b % 3), 0x7dd3fc, 0))
          bubbles.push(bubble)
          tween({ targets: bubble, y: 165 + (b % 4) * 12, duration: 1500 + b * 90, repeat: -1, delay: b * 95 })
        }
        var rateRing = add(scene.add.circle(922, 238, 82, 0x102f40, 1).setStrokeStyle(11, 0x1c4960, 1))
        var rate = label(922, 227, '0', 52, '#69f0ae', true, 0.5, 0.5)
        label(922, 276, '光合效率', 13, '#7d9bad', true, 0.5, 0.5)
        var verdict = panel(832, 337, 180, 38, 0x17394d, 1, 19, 0x60a5fa, 0.18)
        var verdictText = label(922, 356, '', 13, '#a9c4d5', true, 0.5, 0.5)
        var tip = label(922, 399, '', 11, '#63899d', false, 0.5, 0.5)

        function change(row, delta) {
          if (mode !== 'preview') return
          state[row.key] = clamp(state[row.key] + delta, row.min, row.max)
          refresh()
          ctx.emit('parameter-change', { key: row.key, value: state[row.key] })
        }

        function refresh() {
          controls.forEach(function (control) {
            var row = control.row
            var ratio = (state[row.key] - row.min) / (row.max - row.min)
            control.fill.setSize(Math.max(6, 238 * ratio), 8)
            control.value.setText(state[row.key] + row.unit)
          })
          var lightFactor = 1 - Math.exp(-state.light / 36)
          var co2Factor = 1 - Math.exp(-state.co2 / 32)
          var tempFactor = Math.exp(-Math.pow((state.temp - 25) / 10, 2))
          var score = Math.round(112 * lightFactor * co2Factor * tempFactor)
          score = clamp(score, 0, 100)
          rate.setText(String(score))
          rate.setColor(score >= 80 ? '#69f0ae' : score >= 55 ? '#fbbf24' : '#fb7185')
          rateRing.setStrokeStyle(11, score >= 80 ? 0x34d399 : score >= 55 ? 0xfbbf24 : 0xfb7185, 0.82)
          sun.setAlpha(0.28 + state.light / 140).setScale(0.75 + state.light / 230)
          leafA.setFillStyle(score >= 55 ? 0x20b96c : 0x557d55)
          leafB.setFillStyle(score >= 80 ? 0x32d17e : score >= 55 ? 0x229b64 : 0x557d55)
          bubbles.forEach(function (bubble, index) { bubble.setAlpha(index < Math.round(score / 7.2) ? 0.78 : 0) })
          if (score >= 80) {
            verdict.setFillStyle(0x124f3d).setStrokeStyle(1, 0x34d399, 0.55)
            verdictText.setText('★ 最佳生长区间').setColor('#6ee7b7')
            tip.setText('能量、原料与温度协同匹配')
          } else if (state.temp > 31) {
            verdict.setFillStyle(0x4d2f19).setStrokeStyle(1, 0xf59e0b, 0.45)
            verdictText.setText('温度偏高').setColor('#fbbf24')
            tip.setText('降低温度，减少酶活性受限')
          } else if (state.light < 60) {
            verdictText.setText('光照不足').setColor('#fda4af')
            tip.setText('提高光照，补充能量来源')
          } else {
            verdictText.setText('仍有限制因素').setColor('#fbbf24')
            tip.setText('尝试增加 CO₂ 或接近 25°C')
          }
        }

        refresh()
      }

      function buildPageThree() {
        buildFrame('03  ·  闯关挑战', '拖动卡片到正确区域；也可以先点卡片，再点分类区', 0xa78bfa)
        var score = 0
        var selected = null
        var completed = {}
        var zoneDefs = [
          { key: 'input', name: '输入 / 条件', sub: '反应前需要', x: 28, colour: 0x38bdf8 },
          { key: 'output', name: '反应产物', sub: '反应后生成', x: 382, colour: 0x34d399 },
          { key: 'other', name: '干扰项', sub: '不直接写入方程式', x: 736, colour: 0xfbbf24 }
        ]
        var zones = {}
        zoneDefs.forEach(function (item) {
          var bg = panel(item.x, 101, 316, 178, 0x0d2637, 0.88, 22, item.colour, 0.24)
            .setInteractive({ useHandCursor: true })
          label(item.x + 22, 121, item.name, 17, colourString(item.colour), true)
          label(item.x + 22, 150, item.sub, 11, '#66899d', false)
          var hint = label(item.x + 158, 219, '拖放至此', 13, '#44697d', true, 0.5, 0.5)
          zones[item.key] = { bg: bg, def: item, count: 0, hint: hint }
          listen(bg, 'pointerdown', function () { if (selected) place(selected, item.key) })
        })

        var cards = [
          { id: 'sun', text: '☀  阳光', target: 'input', colour: 0xfbbf24 },
          { id: 'water', text: '◆  水', target: 'input', colour: 0x38bdf8 },
          { id: 'co2', text: 'CO₂  二氧化碳', target: 'input', colour: 0xa78bfa },
          { id: 'oxygen', text: 'O₂  氧气', target: 'output', colour: 0x67e8f9 },
          { id: 'sugar', text: '⬡  葡萄糖', target: 'output', colour: 0x34d399 },
          { id: 'mineral', text: '◇  矿物盐', target: 'other', colour: 0xf59e0b }
        ]
        var startXs = [114, 284, 454, 624, 794, 964]
        cards.forEach(function (data, index) {
          var card = scene.add.container(startXs[index], 344)
          var shadow = scene.add.rectangle(4, 6, 150, 72, 0x000000, 0.22).setRounded(16)
          var bg = scene.add.rectangle(0, 0, 150, 72, 0x15364a, 1).setRounded(16).setStrokeStyle(2, data.colour, 0.42)
          var text = scene.add.text(0, 0, data.text, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#f4fbff' }).setOrigin(0.5)
          card.add([shadow, bg, text])
          card.setSize(150, 72).setInteractive({ useHandCursor: true, draggable: true })
          card.setData('meta', data)
          card.setData('homeX', startXs[index])
          card.setData('homeY', 344)
          add(card)
          scene.input.setDraggable(card)
          listen(card, 'pointerdown', function () {
            if (mode !== 'preview' || completed[data.id]) return
            if (selected && selected !== card) selectCard(selected, false)
            selected = card
            selectCard(card, true)
          })
          listen(card, 'dragstart', function () {
            if (mode !== 'preview' || completed[data.id]) return
            stage.bringToTop(card)
            card.setData('dragMoved', false)
            card.setData('dragStartX', card.x)
            card.setData('dragStartY', card.y)
            card.setScale(1.07)
          })
          listen(card, 'drag', function (_pointer, dragX, dragY) {
            if (mode !== 'preview' || completed[data.id]) return
            if (Math.hypot(dragX - card.getData('dragStartX'), dragY - card.getData('dragStartY')) > 7) {
              card.setData('dragMoved', true)
            }
            card.setPosition(dragX, dragY)
          })
          listen(card, 'dragend', function () {
            if (mode !== 'preview' || completed[data.id]) return
            card.setScale(1)
            var target = findZone(card.x, card.y)
            if (target) place(card, target)
            else if (!card.getData('dragMoved')) {
              card.setPosition(card.getData('homeX'), card.getData('homeY')).setScale(1.04)
              selected = card
              selectCard(card, true)
            }
            else returnHome(card)
          })
        })

        var victory = panel(390, 400, 300, 42, 0x143246, 1, 21, 0xa78bfa, 0.18)
        var scoreText = label(540, 421, '已完成 0 / 6', 13, '#85a9bd', true, 0.5, 0.5)

        function selectCard(card, on) {
          card.list[1].setStrokeStyle(on ? 3 : 2, card.getData('meta').colour, on ? 1 : 0.42)
          tween({ targets: card, scale: on ? 1.04 : 1, duration: 100 })
        }

        function findZone(x, y) {
          if (y < 101 || y > 279) return null
          if (x >= 28 && x <= 344) return 'input'
          if (x >= 382 && x <= 698) return 'output'
          if (x >= 736 && x <= 1052) return 'other'
          return null
        }

        function place(card, zoneKey) {
          if (mode !== 'preview') return
          var data = card.getData('meta')
          if (completed[data.id]) return
          if (data.target !== zoneKey) {
            var originalX = card.x
            tween({ targets: card, x: originalX - 9, duration: 55, yoyo: true, repeat: 3, onComplete: function () { returnHome(card) } })
            zones[zoneKey].bg.setStrokeStyle(3, 0xfb7185, 0.8)
            tween({ targets: zones[zoneKey].bg, alpha: 0.6, yoyo: true, duration: 180, onComplete: function () { zones[zoneKey].bg.setStrokeStyle(1, zones[zoneKey].def.colour, 0.24) } })
            ctx.emit('classification', { card: data.id, correct: false })
            return
          }
          completed[data.id] = true
          score += 1
          zones[zoneKey].count += 1
          zones[zoneKey].hint.setVisible(false)
          var x = zones[zoneKey].def.x + 74 + ((zones[zoneKey].count - 1) % 3) * 84
          var y = zones[zoneKey].count > 3 ? 244 : 209
          card.disableInteractive().setScale(0.52)
          tween({ targets: card, x: x, y: y, duration: 280, ease: 'Back.easeOut' })
          card.list[1].setFillStyle(zones[zoneKey].def.colour, 0.22).setStrokeStyle(2, zones[zoneKey].def.colour, 0.9)
          if (selected === card) selected = null
          scoreText.setText('已完成 ' + score + ' / 6')
          if (score === 6) {
            victory.setFillStyle(0x174c3b).setStrokeStyle(2, 0x34d399, 0.65)
            scoreText.setText('★ 全部正确 · 光合达人').setColor('#6ee7b7').setFontSize(15)
            tween({ targets: [victory, scoreText], scale: 1.08, yoyo: true, duration: 260 })
            ctx.emit('completed', { page: 3 })
          }
          ctx.emit('classification', { card: data.id, correct: true })
        }

        function returnHome(card) {
          if (selected === card) selected = null
          selectCard(card, false)
          tween({ targets: card, x: card.getData('homeX'), y: card.getData('homeY'), duration: 240, ease: 'Cubic.easeOut' })
        }
      }

      function build() {
        clear()
        if (page === 2) buildPageTwo()
        else if (page === 3) buildPageThree()
        else buildPageOne()
      }

      function layout(width, height) {
        var scale = Math.min(width / BASE_W, height / BASE_H)
        stage.setScale(scale)
        stage.setPosition((width - BASE_W * scale) / 2, (height - BASE_H * scale) / 2)
      }

      build()
      layout(ctx.width, ctx.height)

      return {
        setMode: function (nextMode) { mode = nextMode },
        resize: function (width, height) { layout(width, height) },
        updateProps: function (nextProps) {
          var nextPage = normalisePage(nextProps.page)
          if (nextPage !== page) { page = nextPage; build() }
        },
        destroy: function () { clear(); stage.destroy(true) }
      }
    }
  })

  function normalisePage(value) {
    var number = Math.round(Number(value))
    return number === 2 || number === 3 ? number : 1
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }

  function colourString(value) { return '#' + value.toString(16).padStart(6, '0') }
})()
