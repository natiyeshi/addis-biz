const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const targetUrl = req.body.url || 'https://addisbiz.com/business-directory/construction/contractors-general?city=Addis%20Ababa&page=3';

  const browser = await chromium.launch({ headless: false }); // Use headless: true in production
  const page = await browser.newPage();
  page.setDefaultTimeout(60000); // Set default timeout to 60 seconds

  try {
    console.log('🔄 Navigating to the listing page...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('networkidle');

    // Wait for the selector longer, in case it loads slowly
    await page.waitForSelector('a.address', { timeout: 60000 });

    const links = await page.$$eval('a.address', (elements) =>
      elements.map((el) => el.href)
    );

    console.log(`✅ Found ${links.length} company links.`);
    const results = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      console.log(`\n🔍 Visiting [${i + 1}/${links.length}]: ${link}`);

      try {
        const detailPage = await browser.newPage();
        await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await detailPage.waitForSelector('table.businessdetails', { timeout: 10000 });

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
    await page.screenshot({ path: 'error.png' }); // Optional: save screenshot for debugging
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
