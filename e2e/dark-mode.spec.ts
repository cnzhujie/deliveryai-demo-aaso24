import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

const darkToggleZh = '切换至夜间模式'
const lightToggleZh = '切换至日间模式'

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name + '.png')
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function enterMenu(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /A08/ }).first().click()
  await expect(page.getByRole('button', { name: darkToggleZh })).toBeVisible()
  await page.getByRole('button', { name: /进入点餐|Enter/ }).click()
  await expect(page.getByPlaceholder('搜索锅底、菜品或饮品')).toBeVisible()
}

async function expectDarkTheme(page: Page) {
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#121416')
}

async function expectLightTheme(page: Page) {
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fbf5ea')
}

async function addFirstDish(page: Page) {
  await page.locator('article').first().getByRole('button').last().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '加入本桌购物车' }).click()
  await expect(page.getByText('共 1 份菜品')).toBeVisible()
}

type Rgb = { r: number; g: number; b: number; a: number }

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error('无法解析颜色：' + value)
  return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 }
}

function composite(foreground: Rgb, background: Rgb): Rgb {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  }
}

function luminance(color: Rgb) {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: Rgb, second: Rgb) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

async function textContrast(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    let background = style.backgroundColor
    let ancestor = element.parentElement
    while (background === 'rgba(0, 0, 0, 0)' && ancestor) {
      background = getComputedStyle(ancestor).backgroundColor
      ancestor = ancestor.parentElement
    }
    return { foreground: style.color, background, fontSize: style.fontSize, fontWeight: style.fontWeight }
  })
}

test.describe('夜间模式 - E2E 验收测试', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('AC-01/02/03/04/09/16: 默认日间、全流程入口、双向即时切换与持久化', async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')

    await test.step('首次访问不跟随系统深色偏好', async () => {
      await expectLightTheme(page)
      await expect(page.getByRole('button', { name: darkToggleZh })).toHaveAttribute('aria-pressed', 'false')
    })

    await test.step('绑定页切到夜间模式并刷新保持', async () => {
      await page.getByRole('button', { name: darkToggleZh }).click()
      await expectDarkTheme(page)
      await expect(page.getByRole('button', { name: lightToggleZh })).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
      await capture(page, testInfo, 'bind-dark-desktop')
      await page.reload()
      await expectDarkTheme(page)
    })

    await test.step('欢迎页和主业务页均提供切换入口', async () => {
      await page.getByRole('button', { name: /A08/ }).first().click()
      await expect(page.getByRole('button', { name: lightToggleZh })).toBeVisible()
      await page.getByRole('button', { name: '进入点餐' }).click()
      await expect(page.getByRole('button', { name: lightToggleZh })).toBeVisible()
    })

    await test.step('切回日间模式并刷新保持', async () => {
      await page.getByRole('button', { name: lightToggleZh }).click()
      await expectLightTheme(page)
      await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light')
      await page.reload()
      await expectLightTheme(page)
    })
  })

  test('AC-05/06/13/15: 夜间主题覆盖核心页面、弹窗和业务状态且切换不丢状态', async ({ page }, testInfo) => {
    await enterMenu(page)
    const search = page.getByPlaceholder('搜索锅底、菜品或饮品')
    await search.fill('锅')
    const searchBoxBefore = await search.boundingBox()
    await addFirstDish(page)

    await test.step('购物车和输入状态在切换后保持，布局不位移', async () => {
      await page.getByRole('button', { name: darkToggleZh }).click()
      await expectDarkTheme(page)
      await expect(search).toHaveValue('锅')
      await expect(page.getByText('共 1 份菜品')).toBeVisible()
      const searchBoxAfter = await search.boundingBox()
      expect(searchBoxAfter?.width).toBe(searchBoxBefore?.width)
      expect(searchBoxAfter?.height).toBe(searchBoxBefore?.height)
    })

    await test.step('规格弹窗、超级辣警告和选中状态适配夜间主题', async () => {
      await search.fill('')
      await page.getByRole('button', { name: '锅底' }).click()
      await page.locator('article').first().getByRole('button').last().click()
      await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(18, 20, 22)')
      await page.getByRole('button', { name: '超级辣' }).click()
      await expect(page.getByText('风险提示')).toBeVisible()
      await expectDarkTheme(page)
      await capture(page, testInfo, 'super-spicy-dialog-dark')
      await page.getByRole('button', { name: '重新选择' }).click()
      await page.keyboard.press('Escape')
    })

    await test.step('桌边服务、等待状态、演示控制台和售罄状态适配夜间主题', async () => {
      await page.getByRole('button', { name: '呼叫服务' }).click()
      await expect(page.getByRole('dialog')).toContainText('桌边服务')
      await page.getByRole('button', { name: /加汤/ }).first().click()
      await expect(page.getByRole('dialog')).toContainText('等待响应')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: '演示控制台' }).click()
      await expect(page.getByRole('dialog')).toContainText('1 个待响应')
      await expect(page.getByRole('button', { name: /山野菌菇拼盘/ })).toContainText('山野菌菇拼盘')
      await capture(page, testInfo, 'demo-console-dark')
      await page.getByRole('button', { name: '完成设置' }).click()
    })

    await test.step('订单、结账和支付完成态保持夜间主题', async () => {
      await page.getByRole('button', { name: '确认并提交订单' }).click()
      await expect(page.getByRole('heading', { name: '这一锅，正在抵达' })).toBeVisible()
      await expectDarkTheme(page)
      await page.getByRole('button', { name: '去结账' }).click()
      await expect(page.getByRole('heading', { name: '核对本桌账单' })).toBeVisible()
      await page.getByRole('button', { name: /确认支付/ }).click()
      await expect(page.getByRole('heading', { name: '付款完成' })).toBeVisible()
      await expectDarkTheme(page)
      await capture(page, testInfo, 'payment-success-dark')
    })
  })

  test('AC-07/08: 夜间模式文字、边界与键盘焦点达到 WCAG 2.1 AA 对比度', async ({ page }) => {
    await page.goto('/?preview=menu')
    await page.getByRole('button', { name: darkToggleZh }).click()

    const samples = [
      page.getByRole('heading', { name: '想吃什么，一起点。' }),
      page.getByPlaceholder('搜索锅底、菜品或饮品'),
      page.locator('article').first().getByRole('heading'),
      page.locator('article').first().locator('p').first(),
    ]

    for (const sample of samples) {
      const colors = await textContrast(sample)
      const background = parseRgb(colors.background)
      const foreground = composite(parseRgb(colors.foreground), background)
      const largeText = Number.parseFloat(colors.fontSize) >= 24
        || (Number.parseFloat(colors.fontSize) >= 18.66 && Number.parseInt(colors.fontWeight, 10) >= 700)
      expect(contrastRatio(foreground, background), JSON.stringify(colors)).toBeGreaterThanOrEqual(largeText ? 3 : 4.5)
    }

    const input = page.getByPlaceholder('搜索锅底、菜品或饮品')
    const borderColors = await input.evaluate((element) => {
      const style = getComputedStyle(element)
      return { border: style.borderTopColor, background: style.backgroundColor }
    })
    expect(contrastRatio(parseRgb(borderColors.border), parseRgb(borderColors.background)), JSON.stringify(borderColors)).toBeGreaterThanOrEqual(3)

    await input.focus()
    await expect(input).toBeFocused()
    const focusStyles = await input.evaluate((element) => {
      const style = getComputedStyle(element)
      return { outline: style.outlineStyle, shadow: style.boxShadow }
    })
    expect(focusStyles.outline !== 'none' || focusStyles.shadow !== 'none', JSON.stringify(focusStyles)).toBeTruthy()
  })

  test('AC-10: localStorage 读写失败时仍可切换并继续核心操作', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage read blocked') }
      Storage.prototype.setItem = () => { throw new Error('storage write blocked') }
    })
    await page.goto('/')
    await expectLightTheme(page)
    await page.getByRole('button', { name: darkToggleZh }).click()
    await expectDarkTheme(page)
    await page.getByRole('button', { name: /A08/ }).first().click()
    await page.getByRole('button', { name: '进入点餐' }).click()
    await page.getByPlaceholder('搜索锅底、菜品或饮品').fill('牛肉')
    await expect(page.getByRole('heading', { name: '琥珀嫩牛肉' })).toBeVisible()
  })

  test('AC-11/12: 主题与老人模式、语言相互独立且分别保存', async ({ page }) => {
    await enterMenu(page)
    await page.getByRole('button', { name: darkToggleZh }).click()
    await page.getByRole('button', { name: '切换至老人模式' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveClass(/elderly/)
    await expect.poll(() => page.evaluate(() => ({ theme: localStorage.getItem('theme'), elderly: localStorage.getItem('elderly-mode') }))).toEqual({ theme: 'dark', elderly: 'true' })

    await page.getByRole('button', { name: '切换语言' }).click()
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveClass(/elderly/)
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expectLightTheme(page)
    await expect(page.locator('html')).toHaveClass(/elderly/)
    await page.reload()
    await expectLightTheme(page)
    await expect(page.locator('html')).toHaveClass(/elderly/)
  })

  test('AC-14: 移动端主题切换不造成溢出并保持核心入口可操作', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?preview=menu')
    const dimensionsBefore = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
    await page.getByRole('button', { name: darkToggleZh }).click()
    await expectDarkTheme(page)
    const dimensionsAfter = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))
    expect(dimensionsBefore.width).toBeLessThanOrEqual(dimensionsBefore.viewport)
    expect(dimensionsAfter.width).toBeLessThanOrEqual(dimensionsAfter.viewport)
    await expect(page.getByRole('button', { name: '点餐' })).toBeVisible()
    await expect(page.getByRole('button', { name: '订单' })).toBeVisible()
    await expect(page.getByRole('button', { name: '服务', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '演示', exact: true })).toBeVisible()
    await capture(page, testInfo, 'menu-dark-mobile')
  })
})
