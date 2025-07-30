const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const targetUrl = req.body.url || 'https://addisbiz.com/business-directory/construction/contractors-general?city=Addis%20Ababa&page=4';
  console.log("request start : ")
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Remove all timeouts
  page.setDefaultTimeout(0); // ⬅️ No timeout globally
  page.setDefaultNavigationTimeout(0); // ⬅️ Also remove navigation timeout

  try {
    console.log('🔄 Navigating to the listing page...');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    console.info("____++___++_______")
    await page.waitForSelector('a.name'); // no timeout here

    const links = await page.$$eval('a.name', (elements) =>
      elements.map((el) => el.href)
    );

    console.log(`✅ Found ${links.length} company links.`);
    const results = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      console.log(`\n🔍 Visiting [${i + 1}/${links.length}]: ${link}`);

      try {
        const detailPage = await browser.newPage();
        detailPage.setDefaultTimeout(0);
        detailPage.setDefaultNavigationTimeout(0);

        await detailPage.goto(link, { waitUntil: 'domcontentloaded' });
        await detailPage.waitForSelector('table.businessdetails');

        const mobile = await detailPage.$$eval('table.businessdetails tr', (rows) => {
          for (const row of rows) {
            const label = row.querySelector('td')?.innerText.trim();
            const value = row.querySelectorAll('td')[1]?.innerText.trim();
            if (label && label.toLowerCase().includes('mobile') && value) {
              return value;
            }
          }
          return null;
        });

        if (!mobile) {
          console.log('⛔️ No mobile number found. Skipping...');
          await detailPage.close();
          continue;
        }

        const companyName = await detailPage.title();
        console.log(`✅ Found: ${companyName} | 📱 Mobile: ${mobile}`);

        results.push({
          company: companyName,
          mobile,
          link,
        });

        await detailPage.close();
      } catch (err) {
        console.warn(`❌ Error scraping link: ${link}`);
        console.error(err);
      }
    }

    console.log(`\n🎯 Finished scraping. Found ${results.length} companies with mobile numbers.`);
    await browser.close();

    return res.json(results);
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    await page.screenshot({ path: 'error.png' });
    await browser.close();
    return res.status(500).json({
      error: 'Scraping failed',
      details: error.message,
    });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
