import db from '../db/database.js';

// Stock name mappings
const stockNames = {
  'ITC': 'ITC Limited',
  'TATASTEEL': 'Tata Steel',
  'TATAPOWER': 'Tata Power',
  'TMPV': 'Tata Motors (DVR)',
  'SYNCOMF': 'Syncom Formulations',
  'SUZLON': 'Suzlon Energy',
  'SBIN': 'State Bank of India',
  'SOUTHBANK': 'South Indian Bank',
  'EASEMYTRIP': 'Easy Trip Planners',
  'IRFC': 'Indian Railway Finance Corp',
  'ZENSARTECH': 'Zensar Technologies',
  'VEDL': 'Vedanta Limited',
  'RAMASTEEL': 'Rama Steel Tubes',
  'MISHTANN': 'Mishtann Foods',
  'IRB': 'IRB Infrastructure',
  'IOC': 'Indian Oil Corporation',
  'MANAPPURAM': 'Manappuram Finance',
  'DRREDDY': 'Dr. Reddys Laboratories',
  'MAHABANK': 'Bank of Maharashtra',
  'MOTHERSON': 'Motherson Sumi',
  'TRITURBINE': 'Triveni Turbine',
  'ITCHOTELS': 'ITC Hotels',
  'BAJFINANCE': 'Bajaj Finance',
  'NATIONALUM': 'National Aluminium',
  'ZYDUSLIFE': 'Zydus Lifesciences',
  'IEX': 'Indian Energy Exchange',
};

// Parse month name to number
const monthMap = {
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12',
};

function parseDate(dateStr) {
  const parts = dateStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const month = monthMap[parts[0]];
  const year = parts[1];
  if (!month || !year) return null;
  return `${year}-${month}-15`; // Use 15th of the month
}

function parsePrice(priceStr) {
  return parseFloat(priceStr.replace(/[₹,]/g, '')) || 0;
}

// Transaction data
const rawData = `ITC    ₹338.40    10    Dec 2022    0    ₹3,384.00
TATASTEEL    ₹104.00    5    Dec 2022    0    ₹520.00
TATASTEEL    ₹105.30    5    Dec 2022    0    ₹526.50
TATAPOWER    ₹205.70    10    Dec 2022    0    ₹2,057.00
TMPV    ₹390.00    10    Dec 2022    0    ₹3,900.00
SYNCOMF    ₹8.90    100    Jan 2023    0    ₹890.00
SUZLON    ₹10.70    100    Jan 2023    0    ₹1,070.00
SBIN    ₹594.00    5    Jan 2023    0    ₹2,970.00
SOUTHBANK    ₹18.45    30    Jan 2023    0    ₹553.50
SOUTHBANK    ₹16.60    20    Jan 2023    0    ₹332.00
SBIN    ₹579.00    5    Jan 2023    0    ₹2,895.00
EASEMYTRIP    ₹51.00    20    Jan 2023    0    ₹1,020.00
IRFC    ₹32.15    30    Jan 2023    0    ₹964.50
ZENSARTECH    ₹231.00    10    Jan 2023    0    ₹2,310.00
TATAPOWER    ₹202.80    3    Jan 2023    0    ₹608.40
SBIN    ₹538.00    5    Jan 2023    0    ₹2,690.00
TATAPOWER    ₹200.35    7    Jan 2023    0    ₹1,402.45
VEDL    ₹319.95    10    Jan 2023    0    ₹3,199.50
SBIN    ₹528.00    10    Feb 2023    0    ₹5,280.00
SUZLON    ₹8.85    50    Feb 2023    0    ₹442.50
VEDL    ₹312.90    10    Feb 2023    0    ₹3,129.00
EASEMYTRIP    ₹49.80    10    Feb 2023    0    ₹498.00
IRFC    ₹31.10    15    Feb 2023    0    ₹466.50
TATASTEEL    ₹111.30    10    Feb 2023    0    ₹1,113.00
TATASTEEL    ₹111.30    10    Feb 2023    0    ₹1,113.00
IRFC    ₹27.95    30    Feb 2023    0    ₹838.50
EASEMYTRIP    ₹46.00    20    Feb 2023    0    ₹920.00
RAMASTEEL    ₹32.50    30    Feb 2023    0    ₹975.00
TATASTEEL    ₹104.80    10    Feb 2023    0    ₹1,048.00
VEDL    ₹284.50    10    Mar 2023    0    ₹2,845.00
SUZLON    ₹8.60    50    Mar 2023    0    ₹430.00
TMPV    ₹418.50    4    Mar 2023    0    ₹1,674.00
RAMASTEEL    ₹31.20    10    Mar 2023    0    ₹312.00
SYNCOMF    ₹6.25    100    Mar 2023    0    ₹625.00
TATASTEEL    ₹105.95    5    Mar 2023    0    ₹529.75
TATASTEEL    ₹104.60    5    Mar 2023    0    ₹523.00
EASEMYTRIP    ₹44.45    20    Mar 2023    0    ₹889.00
TATAPOWER    ₹193.00    5    Mar 2023    0    ₹965.00
TMPV    ₹403.75    4    Mar 2023    0    ₹1,615.00
TATAPOWER    ₹185.10    5    Mar 2023    0    ₹925.50
SYNCOMF    ₹5.95    100    Mar 2023    0    ₹595.00
IRFC    ₹27.60    50    Apr 2023    0    ₹1,380.00
SOUTHBANK    ₹15.35    100    Apr 2023    0    ₹1,535.00
SBIN    ₹522.20    5    Apr 2023    0    ₹2,611.00
VEDL    ₹268.70    5    Apr 2023    0    ₹1,343.50
TATASTEEL    ₹104.80    10    Apr 2023    0    ₹1,048.00
ITC    ₹392.95    5    Apr 2023    0    ₹1,964.75
EASEMYTRIP    ₹45.10    30    Apr 2023    0    ₹1,353.00
VEDL    ₹282.60    5    May 2023    0    ₹1,413.00
ZENSARTECH    ₹313.15    5    May 2023    0    ₹1,565.75
TATASTEEL    ₹105.75    10    May 2023    0    ₹1,057.50
ITC    ₹444.45    5    Jun 2023    0    ₹2,222.25
EASEMYTRIP    ₹44.70    20    Jun 2023    0    ₹894.00
TMPV    ₹566.70    2    Jun 2023    0    ₹1,133.40
TATASTEEL    ₹118.25    10    Aug 2023    0    ₹1,182.50
EASEMYTRIP    ₹40.30    20    Aug 2023    0    ₹806.00
ITC    ₹446.55    10    Aug 2023    0    ₹4,465.50
SBIN    ₹577.25    5    Sep 2023    0    ₹2,886.25
SYNCOMF    ₹8.65    100    Sep 2023    0    ₹865.00
EASEMYTRIP    ₹44.00    30    Sep 2023    0    ₹1,320.00
TATASTEEL    ₹124.50    10    Oct 2023    1.3    ₹1,245.00
TATAPOWER    ₹253.55    5    Oct 2023    0    ₹1,267.75
ITC    ₹442.00    5    Oct 2023    0    ₹2,210.00
RAMASTEEL    ₹34.95    7    Oct 2023    0    ₹244.65
TATASTEEL    ₹117.85    10    Nov 2023    1.3    ₹1,178.50
ITC    ₹433.25    5    Nov 2023    2.26    ₹2,166.25
SBIN    ₹580.95    5    Nov 2023    3    ₹2,904.75
EASEMYTRIP    ₹39.55    30    Dec 2023    1.3    ₹1,186.50
MISHTANN    ₹15.99    100    Dec 2023    1.67    ₹1,599.00
SOUTHBANK    ₹25.85    50    Dec 2023    1.34    ₹1,292.50
IRFC    ₹76.95    10    Dec 2023    0.8    ₹769.50
IRB    ₹37.80    30    Dec 2023    1.18    ₹1,134.00
ITC    ₹458.75    5    Dec 2023    1.29    ₹2,293.75
MISHTANN    ₹15.86    50    Dec 2023    1    ₹793.00
IRB    ₹39.10    20    Dec 2023    1.08    ₹782.00
TATAPOWER    ₹340.55    5    Jan 2024    2.07    ₹1,702.75
ITC    ₹471.20    5    Jan 2024    2.75    ₹2,356.00
VEDL    ₹264.35    5    Jan 2024    1.34    ₹1,321.75
RAMASTEEL    ₹37.90    16    Jan 2024    0.63    ₹606.40
ITC    ₹445.35    10    Feb 2024    5.64    ₹4,453.50
TATASTEEL    ₹142.35    10    Feb 2024    1.48    ₹1,423.50
SOUTHBANK    ₹38.20    15    Feb 2024    0.6    ₹573.00
ITC    ₹406.05    10    Mar 2024    5.23    ₹4,060.50
TATAPOWER    ₹397.90    5    Mar 2024    2.07    ₹1,989.50
SUZLON    ₹39.95    10    Mar 2024    0.7    ₹399.50
RAMASTEEL    ₹15.25    37    Mar 2024    0.59    ₹564.25
SOUTHBANK    ₹7.50    53    Apr 2024    0    0
IRFC    ₹147.65    10    Apr 2024    1.54    ₹1,476.50
TATASTEEL    ₹168.40    10    Apr 2024    1.75    ₹1,684.00
TATAPOWER    ₹436.95    5    Apr 2024    2.27    ₹2,184.75
IRB    ₹68.45    9    Apr 2024    0.64    ₹616.05
TMPV    ₹983.50    8    Apr 2024    9.71    ₹7,868.00
ZENSARTECH    ₹617.34    5    May 2024    3.21    ₹3,086.70
TATASTEEL    ₹165.45    10    May 2024    1.72    ₹1,654.50
IRFC    ₹151.75    5    May 2024    0.79    ₹758.75
SUZLON    ₹39.70    15    May 2024    0.62    ₹595.50
TATASTEEL    ₹163.10    10    June 2024    1.71    ₹1,631.00
ITC    ₹417.50    5    June 2024    2.17    ₹2,087.50
TATAPOWER    ₹410.90    5    June 2024    2.11    ₹2,054.50
SUZLON    ₹47.50    5    June 2024    0.25    ₹237.50
IRFC    ₹165.00    10    June 2024    1.71    ₹1,650.00
IOC    ₹165.05    10    June 2024    1.72    ₹1,650.50
MANAPPURAM    ₹175.95    10    June 2024    1.8    ₹1,759.50
IRB    ₹71.00    1    June 2024    0    ₹71.00
ITC    ₹427.90    10    July 2024    5.45    ₹4,279.00
IRB    ₹64.94    10    July 2024    0.69    ₹649.40
IOC    ₹170.91    20    July 2024    4.56    ₹3,418.20
TATASTEEL    ₹159.56    10    July 2024    1.66    ₹1,595.60
TATASTEEL    ₹157.90    10    August 2024    1.64    ₹1,579.00
MANAPPURAM    ₹206.07    10    August 2024    2.16    ₹2,060.70
SOUTHBANK    ₹25.08    40    August 2024    1.04    ₹1,003.20
TATAPOWER    ₹424.25    5    August 2024    2.21    ₹2,121.25
MISHTANN    ₹16.04    25    August 2024    0.42    ₹401.00
TATAPOWER    ₹421.85    5    September 2024    2.19    ₹2,109.25
MANAPPURAM    ₹209.82    10    September 2024    2.18    ₹2,098.20
IRFC    ₹176.19    10    September 2024    1.83    ₹1,761.90
EASEMYTRIP    ₹38.99    20    September 2024    0.41    ₹779.80
SUZLON    ₹73.75    10    September 2024    0.77    ₹737.50
SOUTHBANK    ₹25.36    20    September 2024    0.53    ₹507.20
TMPV    ₹982.35    2    September 2024    2.04    ₹1,964.70
ZENSARTECH    ₹671.35    5    October 2024    4.48    ₹3,356.75
TATAPOWER    ₹474.30    5    October 2024    2.46    ₹2,371.50
ITC    ₹510.45    3    October 2024    1.59    ₹1,531.35
VEDL    ₹516.75    2    October 2024    1.07    ₹1,033.50
IRFC    ₹152.55    4    October 2024    0.6    ₹610.20
MISHTANN    ₹14.97    6    October 2024    0    ₹89.82
MANAPPURAM    ₹141.12    10    October 2024    1.48    ₹1,411.20
TATASTEEL    ₹149.74    10    November 2024    1.55    ₹1,497.40
ZENSARTECH    ₹699.45    5    November 2024    4.62    ₹3,497.25
EASEMYTRIP    ₹30.30    30    November 2024    0.95    ₹909.00
TATAPOWER    ₹426.95    5    November 2024    2.22    ₹2,134.75
IRB    ₹52.66    15    November 2024    0.82    ₹789.90
SOUTHBANK    ₹24.68    32    November 2024    0.82    ₹789.76
MISHTANN    ₹14.53    20    November 2024    0.3    ₹290.60
TMPV    ₹849.25    5    November 2024    5.4    ₹4,246.25
ITC    ₹491.10    5    November 2024    2.55    ₹2,455.50
SBIN    ₹827.80    4    November 2024    3.44    ₹3,311.20
SYNCOMF    ₹19.57    5    November 2024    0    ₹97.85
IOC    ₹138.99    10    December 2024    1.44    ₹1,389.90
MANAPPURAM    ₹163.10    10    December 2024    1.69    ₹1,631.00
IRFC    ₹148.44    10    December 2024    1.54    ₹1,484.40
SOUTHBANK    ₹24.24    40    December 2024    1.01    ₹969.60
SBIN    ₹851.90    1    December 2024    0.8    ₹851.90
TMPV    ₹795.10    2    December 2024    1.65    ₹1,590.20
DRREDDY    ₹1,260.05    1    December 2024    1.31    ₹1,260.05
IRB    ₹58.60    5    December 2024    0.3    ₹293.00
SBIN    ₹782.38    2    January 2025    1.62    ₹1,564.76
VEDL    ₹442.85    1    January 2025    0.46    ₹442.85
DRREDDY    ₹1,372.80    2    January 2025    2.84    ₹2,745.60
TMPV    ₹782.85    2    January 2025    1.62    ₹1,565.70
TATAPOWER    ₹360.25    5    January 2025    1.87    ₹1,801.25
IOC    ₹131.92    10    January 2025    1.37    ₹1,319.20
MANAPPURAM    ₹181.81    5    January 2025    0.94    ₹909.05
TATASTEEL    ₹129.44    10    January 2025    1.34    ₹1,294.40
IRFC    ₹139.00    6    January 2025    0.87    ₹834.00
MAHABANK    ₹52.06    12    January 2025    0.65    ₹624.72
MAHABANK    ₹51.42    9    January 2025    0.46    ₹462.78
IRFC    ₹150.65    10    January 2025    1.56    ₹1,506.50
TATAPOWER    ₹369.95    5    February 2025    1.92    ₹1,849.75
SBIN    ₹778.90    3    February 2025    2.42    ₹2,336.70
IOC    ₹128.07    10    February 2025    1.33    ₹1,280.70
IRB    ₹54.89    10    February 2025    0.57    ₹548.90
SUZLON    ₹57.38    10    February 2025    0.59    ₹573.80
SOUTHBANK    ₹26.02    20    February 2025    0.54    ₹520.40
SYNCOMF    ₹18.29    26    February 2025    0.49    ₹475.54
EASEMYTRIP    ₹12.59    25    February 2025    0.33    ₹314.75
DRREDDY    ₹1,112.00    1    March 2025    1.15    ₹1,112.00
TMPV    ₹624.20    3    March 2025    1.94    ₹1,872.60
TATAPOWER    ₹350.90    4    March 2025    1.46    ₹1,403.60
SBIN    ₹724.20    2    March 2025    1.5    ₹1,448.40
ITC    ₹397.25    4    March 2025    1.65    ₹1,589.00
MOTHERSON    ₹112.86    5    March 2025    0.64    ₹564.30
ITC    ₹405.00    1    March 2025    0.42    ₹405.00
MAHABANK    ₹47.19    10    March 2025    0.49    ₹471.90
TRITURBINE    ₹513.80    1    April 2025    0.53    ₹513.80
TMPV    ₹567.45    5    April 2025    2.94    ₹2,837.25
ZENSARTECH    ₹601.15    3    April 2025    1.86    ₹1,803.45
ITC    ₹405.40    2    April 2025    0.84    ₹810.80
TATASTEEL    ₹126.17    10    April 2025    1.31    ₹1,261.70
MOTHERSON    ₹110.37    5    April 2025    0.57    ₹551.85
IRB    ₹43.17    10    April 2025    0.45    ₹431.70
MAHABANK    ₹43.59    7    April 2025    0.3    ₹305.13
IOC    ₹143.94    10    May 2025    1.49    ₹1,439.40
DRREDDY    ₹1,178.20    1    May 2025    1.22    ₹1,178.20
TATASTEEL    ₹151.04    10    May 2025    1.57    ₹1,510.40
SUZLON    ₹57.80    20    May 2025    1.2    ₹1,156.00
ITCHOTELS    ₹199.11    1    May 2025    0.21    ₹199.11
TRITURBINE    ₹552.85    2    May 2025    1.15    ₹1,105.70
MAHABANK    ₹50.98    15    May 2025    0.79    ₹764.70
SYNCOMF    ₹16.62    44    May 2025    0.76    ₹731.28
MAHABANK    ₹50.64    47    May 2025    2.47    ₹2,380.08
ZENSARTECH    ₹831.70    2    June 2025    1.73    ₹1,663.40
IRFC    ₹137.11    10    June 2025    1.42    ₹1,371.10
DRREDDY    ₹1,361.90    1    June 2025    1.41    ₹1,361.90
TMPV    ₹706.40    2    June 2025    1.47    ₹1,412.80
SBIN    ₹792.90    2    June 2025    1.65    ₹1,585.80
SUZLON    ₹64.49    10    June 2025    0.67    ₹644.90
ZENSARTECH    ₹819.80    3    July 2025    2.55    ₹2,459.40
BAJFINANCE    ₹935.85    1    July 2025    0.55    ₹935.85
NATIONALUM    ₹189.94    5    July 2025    1    ₹949.70
SOUTHBANK    ₹30.05    20    July 2025    0.62    ₹601.00
DRREDDY    ₹1,240.60    1    July 2025    1.29    ₹1,240.60
ITCHOTELS    ₹246.98    4    July 2025    1.02    ₹987.92
TMPV    ₹675.40    1    July 2025    0.7    ₹675.40
ZYDUSLIFE    ₹961.25    1    July 2025    1    ₹961.25
MOTHERSON    ₹97.78    5    July 2025    0.51    ₹488.90
IRFC    ₹131.27    5    July 2025    0.68    ₹656.35
TMPV    ₹655.95    5    August 2025    3.4    ₹3,279.75
ZENSARTECH    ₹806.55    2    August 2025    1.67    ₹1,613.10
ITC    ₹419.70    4    August 2025    1.47    ₹1,678.80
DRREDDY    ₹1,212.00    1    August 2025    1.26    ₹1,212.00
BAJFINANCE    ₹872.50    1    August 2025    0.91    ₹872.50
TATASTEEL    ₹161.04    5    August 2025    0.84    ₹805.20
SUZLON    ₹64.19    5    August 2025    0.33    ₹320.95
IEX    ₹137.86    1    August 2025    0.14    ₹137.86
BAJFINANCE    ₹951.50    1    September 2025    0.99    ₹951.50
DRREDDY    ₹1,297.80    1    September 2025    1.35    ₹1,297.80
ZENSARTECH    ₹801.25    2    September 2025    1.66    ₹1,602.50
IEX    ₹143.70    10    September 2025    1.49    ₹1,437.00
NATIONALUM    ₹208.00    5    September 2025    1.08    ₹1,040.00
SBIN    ₹814.25    1    September 2025    0.84    ₹814.25
ITC    ₹410.30    2    September 2025    0.85    ₹820.60
TMPV    ₹715.35    1    September 2025    0.74    ₹715.35
IOC    ₹141.24    5    September 2025    0.73    ₹706.20
IRB    ₹42.68    15    September 2025    0.66    ₹640.20
DRREDDY    ₹1,241.90    1    October 2025    1.27    ₹1,241.90
ZYDUSLIFE    ₹982.80    1    October 2025    1.02    ₹982.80
MAHABANK    ₹57.06    20    October 2025    1.18    ₹1,141.20
SOUTHBANK    ₹32.14    40    October 2025    1.33    ₹1,285.60
SUZLON    ₹52.97    15    October 2025    0.82    ₹794.55
SYNCOMF    ₹16.44    50    October 2025    0.85    ₹822.00
TRITURBINE    ₹520.05    2    October 2025    1.08    ₹1,040.10
IRFC    ₹123.60    10    October 2025    1.28    ₹1,236.00
EASEMYTRIP    ₹8.01    100    October 2025    0.83    ₹801.00
IEX    ₹134.10    4    October 2025    0.56    ₹536.40
DRREDDY    ₹1,225.50    1    November 2025    1.27    ₹1,225.50
ZENSARTECH    ₹742.80    5    November 2025    4.85    ₹3,714.00
ZYDUSLIFE    ₹953.40    1    November 2025    0.99    ₹953.40
ITCHOTELS    ₹209.34    5    November 2025    1.09    ₹1,046.70
MOTHERSON    ₹105.13    10    November 2025    1.09    ₹1,051.30
ITC    ₹407.15    4    November 2025    1.69    ₹1,628.60
MAHABANK    ₹57.50    8    November 2025    0.48    ₹460.00
BAJFINANCE    ₹1,009.10    1    December 2025    1.05    ₹1,009.10
NATIONALUM    ₹278.00    5    December 2025    1.44    ₹1,390.00
TATASTEEL    ₹172.28    10    December 2025    1.79    ₹1,722.80
ZENSARTECH    ₹729.25    3    December 2025    2.27    ₹2,187.75
TATAPOWER    ₹379.00    2    December 2025    0.79    ₹758.00
IRFC    ₹112.78    10    December 2025    1.17    ₹1,127.80
TMPV    ₹344.30    5    December 2025    1.79    ₹1,721.50
DRREDDY    ₹1,245.90    1    January 2026    1.29    ₹1,245.90
TMPV    ₹371.05    10    January 2026    4.85    ₹3,710.50
ITC    ₹349.50    10    January 2026    4.63    ₹3,495.00
IEX    ₹133.65    10    January 2026    1.39    ₹1,336.50
ITCHOTELS    ₹197.19    1    January 2026    0.2    ₹197.19`;

function parseTransactions(data) {
  const lines = data.split('\n').filter(line => line.trim());
  const transactions = [];

  for (const line of lines) {
    const parts = line.split(/\s{2,}|\t+/).filter(p => p.trim());
    if (parts.length < 4) continue;

    const symbol = parts[0].trim();
    const price = parsePrice(parts[1]);
    const quantity = parseInt(parts[2]) || 0;
    const dateStr = parts[3].trim();

    // Skip invalid entries
    if (!symbol || price <= 0 || quantity <= 0 || !dateStr) continue;

    const date = parseDate(dateStr);
    if (!date) continue;

    transactions.push({
      symbol,
      name: stockNames[symbol] || symbol,
      price,
      quantity,
      date,
      total: price * quantity,
    });
  }

  return transactions;
}

export function importTransactions(userId) {
  const transactions = parseTransactions(rawData);
  console.log(`Parsed ${transactions.length} transactions`);

  // Group by symbol to create/update assets
  const symbolGroups = {};
  for (const txn of transactions) {
    if (!symbolGroups[txn.symbol]) {
      symbolGroups[txn.symbol] = [];
    }
    symbolGroups[txn.symbol].push(txn);
  }

  const assetCache = {};
  let assetsCreated = 0;
  let transactionsCreated = 0;

  // Prepare statements
  const findAsset = db.prepare(`
    SELECT id FROM assets WHERE user_id = ? AND symbol = ? AND category = 'EQUITY'
  `);

  const insertAsset = db.prepare(`
    INSERT INTO assets (user_id, category, asset_type, name, symbol, exchange, quantity, avg_buy_price)
    VALUES (?, 'EQUITY', 'STOCK', ?, ?, 'NSE', 0, 0)
  `);

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (asset_id, user_id, type, quantity, price, total_amount, transaction_date)
    VALUES (?, ?, 'BUY', ?, ?, ?, ?)
  `);

  const updateAssetHoldings = db.prepare(`
    UPDATE assets SET quantity = ?, avg_buy_price = ? WHERE id = ?
  `);

  // Process each symbol
  for (const [symbol, txns] of Object.entries(symbolGroups)) {
    // Find or create asset
    let asset = findAsset.get(userId, symbol);

    if (!asset) {
      const name = stockNames[symbol] || symbol;
      const result = insertAsset.run(userId, name, symbol);
      asset = { id: result.lastInsertRowid };
      assetsCreated++;
      console.log(`Created asset: ${name} (${symbol})`);
    }

    assetCache[symbol] = asset.id;

    // Calculate totals for avg price
    let totalQty = 0;
    let totalCost = 0;

    // Insert transactions
    for (const txn of txns) {
      insertTransaction.run(asset.id, userId, txn.quantity, txn.price, txn.total, txn.date);
      totalQty += txn.quantity;
      totalCost += txn.total;
      transactionsCreated++;
    }

    // Update asset with total holdings
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    updateAssetHoldings.run(totalQty, avgPrice, asset.id);
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Assets created: ${assetsCreated}`);
  console.log(`   Transactions imported: ${transactionsCreated}`);

  return { assetsCreated, transactionsCreated };
}

// Run if called directly
const args = process.argv.slice(2);
if (args.includes('--run')) {
  const userId = parseInt(args[args.indexOf('--user') + 1]) || 1;
  console.log(`Importing transactions for user ${userId}...\n`);
  importTransactions(userId);
}
