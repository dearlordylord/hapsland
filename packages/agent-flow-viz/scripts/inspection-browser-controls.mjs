/** Open only the evidence needed by a browser scenario, using the native keyboard control. */
export const revealInspection = async (page, selector) => {
  for (const panel of await page
    .locator("details")
    .filter({ has: page.locator(selector) })
    .all()) {
    if (await panel.evaluate((element) => element.open)) continue
    await panel.locator(":scope > summary").focus()
    await page.keyboard.press("Enter")
  }
}
