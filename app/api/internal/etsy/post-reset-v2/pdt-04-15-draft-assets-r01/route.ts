import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { DRAFT_CATALOG_04_15 } from "../../../../../../lib/batch-draft-catalog-04-15";
import { etsyApiHeaders } from "../../../../../../lib/etsy";
import { getValidEtsyAccessToken } from "../../../../../../lib/etsy-auth";
import { getEtsySellerStateSnapshot } from "../../../../../../lib/etsy-seller-state-reconciliation";
import { enforceBuildGateForRoute, evaluateProductCreationPlanQC, getProductPlanStore } from "../../../../../../lib/product-creation-plan";
import { CANONICAL_PLANS_04_15 } from "../../../../../../lib/product-creation-plan/canonical-plans-04-15";
import { computePlanSha256 } from "../../../../../../lib/product-creation-plan/types";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=60;
const SHOP_ID=23582741; const OPERATION_ID="PDT-04-15-DRAFT-RECONCILE-ASSETS-R01-20261007"; const AUTH_ACTION="AUTHORIZE_ETSY_DRAFT_UPDATE_PRODUCTS_04_15_KEEP_DRAFT_NO_PUBLISH"; const NONCE_SHA256="8f5c969e853b629a95b4b027fea4669cc6db7c02f8efe239c5c06945cd422453";
const PROTECTED=[[4587646332,"Cleaning Business Schedule Template, Editable Excel Planner, Daily Weekly Monthly Tasks"],[4588681044,"Professional Cleaning Checklist Template, Editable Excel & A4 PDF, Deep Clean, Move-In Move-Out, Quality Control"],[4588738623,"Cleaning Service Proposal Template, Editable Excel & PDF, Commercial Bid System, Scope Matrix, 3-Tier Pricing"]] as const;
type AssetSpec={name:string;size:number;sha256:string;mime:string}; type ProductAssetSpec={listingId:number;zip:AssetSpec;images:AssetSpec[];video:AssetSpec};
const ASSETS:Record<string,ProductAssetSpec>={
  "PDT-CBP-004": {
    "listingId": 4589549763,
    "zip": {
      "name": "PDT-CBP-004 Buyer Package FINAL CLEAN.zip",
      "size": 1091512,
      "sha256": "902237abcb0c17f2e4e869becf386be5973b1e0fee952802bd9878eb91c1b044",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 553234,
        "sha256": "9a70e2c8a7c1112064fb7a00ea252d5c3109bda7f87ed94c09fe814cb7839a24",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 589002,
        "sha256": "e39a74930b5b53735370129f871825f026c73a3ed4dab76b945e1dbf47566f80",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 521569,
        "sha256": "51c3c3f595496ece1060ac9311d46e0680ac81db7310b9b7c752eba717cfc623",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Revenue_Capacity.jpg",
        "size": 541948,
        "sha256": "64c11f8df57514f8654d75cd343f1f0396b39ba79630847af34accabf3820b47",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Budget_Pricing.jpg",
        "size": 508641,
        "sha256": "9d4384ea9e65594e783f915d2c18376f26410cfa4a2734ff87af315e4466620a",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Marketing_Growth.jpg",
        "size": 458120,
        "sha256": "d93042619856e2550dc1822df0ffa02cf962a7faa4a8b56ac0a456dcf7fc38e0",
        "mime": "image/jpeg"
      },
      {
        "name": "07_90_Day_Action_Plan.jpg",
        "size": 442065,
        "sha256": "f6f7d4328753cbe25650ce2a2343483b7eceec4948a31eec64c4ff9686b97095",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 433399,
        "sha256": "4b235c5815923960522aad9e8f2f3cb71d032dcb69940a3bbdb356fb22cf658e",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 537588,
        "sha256": "fc67ad714ef0d7242e50240bc7f37c4d30bcf54b0c23709916e87c7c109d9547",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 429896,
        "sha256": "0aba70ee7cdb87b8de9abf0b2e4c4c3d081f1d1691ab1b7ffcc782f5b848f9b4",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Business_Planner_Listing_Video.mp4",
      "size": 427978,
      "sha256": "7d2938adeb4f80a1808b7a2a49d722ea628b57d63fdd326f8e037edd5089b1b7",
      "mime": "video/mp4"
    }
  },
  "PDT-DCL-005": {
    "listingId": 4589560344,
    "zip": {
      "name": "PDT-DCL-005 Buyer Package FINAL CLEAN.zip",
      "size": 941937,
      "sha256": "652c73fd165dbd6b2b6dc57cf6013e65aa602bb84ff556fb7b6b57c2c0a7cf16",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 452335,
        "sha256": "28788fc7825254701b88d1ac37e84107051bd88e1ea7fce6503860ca5152a412",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 579917,
        "sha256": "3d4f1ad0116b2bd92d752f7805a190c9fc31a14082222b29e91cada7f0ab8dc3",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 572779,
        "sha256": "f277b0366737607cf275beea5ed1d741a6cbfb63d72650418a771ee9d0ea456f",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Kitchen_Bathroom_Deep_Clean.jpg",
        "size": 381403,
        "sha256": "6ef8be7e6002a16b2527a4960aba56f1c0515b7552d8b48147f9f528847d5896",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Appliances_Detailing.jpg",
        "size": 475669,
        "sha256": "ca6165a7ef2d0dcb1ebfcd6d3ebb14f93212777fd75c25979d96f61299e51cad",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Post_Construction_QC.jpg",
        "size": 421872,
        "sha256": "c517048a73e1c74938652295a6f90e5d8640d609dcb57f5b3978c474e4d43495",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Inspection_Tags_Bonus.jpg",
        "size": 449363,
        "sha256": "be31331ad9ab31b9b77681b96932906e0abab3726bc223a3bd998f54a6a3fd01",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 324035,
        "sha256": "3e4891f058c17ad1cf6bcf763d4c9d5a202a985b0c53d8145eb56d34ee47a124",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 367102,
        "sha256": "119f864e2294661c523f0ceb19e619b749db853c712eb2fb18df970bd587f8e1",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 361548,
        "sha256": "a93fa7fd4e4f7262a5cd8495aa998badd6c8bc49c495159667abd8ef2a3141a6",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Deep_Cleaning_Checklist_Listing_Video.mp4",
      "size": 351237,
      "sha256": "3a804945260bf9aa0510ea869074cf329cc998bdba9c7d5978f4bdb56d9293e3",
      "mime": "video/mp4"
    }
  },
  "PDT-MCL-006": {
    "listingId": 4589550241,
    "zip": {
      "name": "PDT-MCL-006 Buyer Package FINAL CLEAN.zip",
      "size": 1537283,
      "sha256": "2b73d88136af7a6089ee7f9b7dc5a46bceaa574f515c2057105b796308a21e7d",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 471642,
        "sha256": "3935dff0b5c89296ca86b6b6ebf7e3ae9b78a360dea52f5752606da15d43eb1c",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 587895,
        "sha256": "4373851692c17c9e36762be8575db82166b81a9a8be43b2393c97ec12d630169",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 368835,
        "sha256": "8bff8737dedf14c5cf16593078bf901df0bcfaa4c4ad2bd2b21afb8755ac61e5",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Move_In_Move_Out_Workflow.jpg",
        "size": 402822,
        "sha256": "5f743d9d8290f70544266d16b43d590785a03b458de2302201990fcac02aeb26",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Kitchen_Bath_Appliances.jpg",
        "size": 334024,
        "sha256": "d0f485bd55ea5520bb5026a3e4cbe1f320a722a0cfdde8d0f4ef6e03210c6deb",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Damage_Log_Signoff.jpg",
        "size": 347961,
        "sha256": "78da91c83d8f8d70d10a14183d9af2281439e530f5cff1efd79e97c9015b1701",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Turnover_Record_Bonus.jpg",
        "size": 476032,
        "sha256": "9a5bf37589f8f06586b3e7f9d8c575f8a2688463e2be9f12e8f894213165f79d",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 357359,
        "sha256": "38b84a8b3b42789fe3cd9c58ff8eb726d6bfc2c47e6fed5cf50fa4bd82963c51",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 353195,
        "sha256": "02731033ffa916325a59359f4a172b12c2390c5a9a1f053ce74949bfbee49b84",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 342521,
        "sha256": "36821bb816dfc4a57e6017adc1eb11ce6f3f3127b49c3199abb8472ffebc4ef3",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Move_In_Move_Out_Checklist_Listing_Video.mp4",
      "size": 305635,
      "sha256": "b54f8da9557c16d4a69ff8f4dc045d07513b16b7d236c16517a5dc15ec32c3bc",
      "mime": "video/mp4"
    }
  },
  "PDT-CCP-007": {
    "listingId": 4589550297,
    "zip": {
      "name": "PDT-CCP-007 Buyer Package FINAL CLEAN.zip",
      "size": 1468001,
      "sha256": "1acaf8e17a0103e31b76be807e834ad95421fffe7568c433eb8923ad7f24d7cb",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 498231,
        "sha256": "5aeb53ca09303d74fd02d06ad26b244ec5fe71189a5f779d78758c49afe8c3a5",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 606241,
        "sha256": "80675b183c5df3341b71f9df821ccae08474de57ca4b6d7d5dbcf288f15b12c2",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 350455,
        "sha256": "37203d84a3dc182f0a34497e7cc46fab52c53b49b4fd1239fca3e9758fa60233",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Bid_Calculator_Formulas.jpg",
        "size": 415694,
        "sha256": "225690048ee6e0ab3879b81ca5276a9c674d36ad08ea804b4bb096b645dc81fe",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Scope_Matrix_Day_Porter.jpg",
        "size": 413699,
        "sha256": "fd3386f6868f5b27bcdab56e7e2adb41fe8bb7e2dd23c798a77ef1509b92f451",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Proposal_Presentation_Deck.jpg",
        "size": 375746,
        "sha256": "b64a270233a1c6700f6fb1b5815afaf16c6d10252d7d7a036ab2d12668d9a53b",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Walkthrough_Sheet_Bonus.jpg",
        "size": 461579,
        "sha256": "cdfc37f55feb9ddf15f709e18796c5a8951f103ee39c7fe0f69e4f43a0b091f6",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 357681,
        "sha256": "d93f2091aea4c7bda221ae43158bcd564fafdc108fd735d4e19be6779f82184f",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 354611,
        "sha256": "3a8f167d49b82187964bc5d135c13c9b166816c523715f2eea0490b32aba94f4",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 338556,
        "sha256": "62e4e7e488eb93aa84396191c49f1976561bc3ff8f82e51d1344ff187fd38db4",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Commercial_Cleaning_Proposal_Listing_Video.mp4",
      "size": 510740,
      "sha256": "865e53db54297c3a4573dfb565e07613a2838c6bff96452c602d735b0b5efb8f",
      "mime": "video/mp4"
    }
  },
  "PDT-CQE-008": {
    "listingId": 4589550347,
    "zip": {
      "name": "PDT-CQE-008 Buyer Package FINAL CLEAN.zip",
      "size": 519084,
      "sha256": "775bae680225cf19550a097c3605142ebbb1105cbf2ad208ea81fa55492fe02c",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 417092,
        "sha256": "a2bed3ddc934d1606477610e49e81f1174d8c88ad54f82e176e8eeb3704cbb36",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 445695,
        "sha256": "81f491ca1af0c6a6cea52d7183cea58314d0247a03292994a7ff0a093eb0e96b",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 345582,
        "sha256": "7e366389daf2b3542e8c8e2aec7e6e8e2808c2967c888f523673eef6398efd14",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Residential_Calculator.jpg",
        "size": 360969,
        "sha256": "c8f19a3a73b7478c9fa8f814af0294b4dbd3f479df3803047da8f7a62457a760",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Commercial_Calculator.jpg",
        "size": 353157,
        "sha256": "060fd3ed172725b0469c0fbfb93f60406ad18236f03fd0b310182f2b4c7b5e40",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Client_Quote_Slip.jpg",
        "size": 336647,
        "sha256": "2b905fa769cd352c92b4170c3591a0070bb375251bb66c028f5f29332246b0a5",
        "mime": "image/jpeg"
      },
      {
        "name": "07_PreQuote_Assessment_Bonus.jpg",
        "size": 340869,
        "sha256": "11e95c3eb421d9e3bdb6f23b91b65f508d52f1519dd0315cd574aed3ad7d2edf",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 314533,
        "sha256": "8d163b2cf1be8eb27e9c8a0e072bc9cb4e3e26eb8713d80b7df0c590520213dc",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 306256,
        "sha256": "3c7950eb195c27da15c1d8de568e0bd275deb7c1d68d31f417817b00c099cc50",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 317792,
        "sha256": "24c7349052710660890b527e9337bd3b39cf423149243b24689fda413ece2724",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Quote_Estimate_Listing_Video.mp4",
      "size": 370890,
      "sha256": "5928c0ee91758271b83b52b3cf147da0f12ec31374534beecd620acba38d46bc",
      "mime": "video/mp4"
    }
  },
  "PDT-CSC-009": {
    "listingId": 4589560648,
    "zip": {
      "name": "PDT-CSC-009 Buyer Package FINAL CLEAN.zip",
      "size": 596583,
      "sha256": "d14ad08c6d2928869dcedcee97f3af57379661d04da02a19ad77dfbbaecee372",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 428695,
        "sha256": "91f05c368d77b56d58415f7eb1e28e51d53a0438493fa4b59a8a86badfe94726",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 434710,
        "sha256": "d2690e587a7c89900ab5c54b483e5cb7f7fd6ed36f0c3800750911a4db86c7ae",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 340797,
        "sha256": "fe56565406a48f8d5eee879babda38d3e1f0a92b4d77bc5626f03e5802138223",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Contract_Clauses_Protection.jpg",
        "size": 453815,
        "sha256": "42b52980f782793a2370e8d32de994fdfa381ef10aa2d083346ccb8fb73bba64",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Residential_Commercial_Schedules.jpg",
        "size": 342928,
        "sha256": "b4c93ccc5a2ca3eaa481a0e5c4df5b67d0e1280d15dfe818ffcfbddbfaf1f6e2",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Printable_Contract_Deck.jpg",
        "size": 342384,
        "sha256": "8f2e583c5ade591abbb8fbd4858d51e575e242cadefafe5a53835f288b799345",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Key_Release_Bonus_Form.jpg",
        "size": 344049,
        "sha256": "8769f95d421e48f9c682b0286cde9d3a4738958fde0be83d6e0008464cf2e939",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 319494,
        "sha256": "638098db1f6197f3204b0252d5e5ad62e551894a6f421aa17f2deb09a3304c0e",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 313429,
        "sha256": "b02a5a5ecf88a3724bfe9c55ed8d06d7fdda3d1e554309ab03a7f1dd3363e724",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 326620,
        "sha256": "c07add1e343538ede160198bcacc9222753ab9302703b9ad1dab1f017fa08616",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Service_Contract_Listing_Video.mp4",
      "size": 391776,
      "sha256": "072e76fd2e939186ca683233e0d89a978556ee5864564a73e71e0cf997ce4161",
      "mime": "video/mp4"
    }
  },
  "PDT-CIF-010": {
    "listingId": 4589560740,
    "zip": {
      "name": "PDT-CIF-010 Buyer Package FINAL CLEAN.zip",
      "size": 743593,
      "sha256": "10b849bb38242f8b1fab6b55b3bb6dc51a0a03d4e396e90ab20b325a1a2678a4",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 381687,
        "sha256": "3e3727167bc153639b31cf294f56ed00c626ab7abc8687ea3548c16d9acdcbd9",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 410389,
        "sha256": "00ab1979cc67e3075003ac959043f1c1f1d52c029eb9d6d27793b9fdf9ac5c2f",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 339245,
        "sha256": "55248e41a6426fcd42651c5186a30e5e5d38631e9f05d75068211411cc333a35",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Property_Surface_Intake.jpg",
        "size": 288653,
        "sha256": "d51a05bd31bd7c39f129ebb771b85d74f9e9a0d62ed91d7cb7c5ed9ac18a61a9",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Pets_Preferences_Access.jpg",
        "size": 295526,
        "sha256": "e507d297758d62746e314f04bb735570687829dd4e1d05b2cabef29039cfa160",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Printable_Intake_Decks.jpg",
        "size": 299549,
        "sha256": "3e6c911e8c84fdd9b60d6441289e31574119a8c0dd6758eef63f955cceb79bde",
        "mime": "image/jpeg"
      },
      {
        "name": "07_First_Visit_Briefing_Card.jpg",
        "size": 311416,
        "sha256": "a46339f87e288d21af6f5a1a8d3fdefd464f92894caaa7fe223ce5dc2cb3d071",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 280351,
        "sha256": "1e3c03fdbfd37b5ed0e067ed8e2f16d4ce8264f8baa0f59d843a04adf7cb1fed",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 310397,
        "sha256": "dd027103747c4992609a7becb50e0d9c0d2af1a6a560ea5631143daf94d8cb41",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 334310,
        "sha256": "11ec06d354709989187d281e24620fddbd850c481b4bf2fa993b80201f1d15d2",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Client_Intake_Listing_Video.mp4",
      "size": 291671,
      "sha256": "fcd42063a417a5e3c33143f6030d73eceb2ab970ed3548bc8be188fd9b2d6f5f",
      "mime": "video/mp4"
    }
  },
  "PDT-CIP-011": {
    "listingId": 4589550605,
    "zip": {
      "name": "PDT-CIP-011 Buyer Package FINAL CLEAN.zip",
      "size": 711689,
      "sha256": "ec9bb12916870aed4fddd0bcc6af5a2cdb7f141f1badc9bc508ce244088a6464",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 370524,
        "sha256": "764286387e7da5405a3a29a0affeaac884c8b5fb613902575ea9ed5fbb9ac8fb",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 402198,
        "sha256": "754e61a9a9777a937bd8d8e0ddb1096c22e1ded8d4856f3ef7d8793d63c02cbb",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 307378,
        "sha256": "a68f1facd385cce5652e9a56120d653b97d550cd07592a510f80c3165c72905a",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Invoice_Generator_Slip.jpg",
        "size": 295202,
        "sha256": "a1f9d75bdb118a2aeabd113ef37d101a9259edfd4e2b0133be149183e1e31700",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Aging_Ledger_Dashboard.jpg",
        "size": 283919,
        "sha256": "f5b2f0e6a76c79c40ebe498176862c09052b8f5422335075ea6ced8ac94b2e0f",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Printable_Invoice_Decks.jpg",
        "size": 293983,
        "sha256": "a9ad71b6719a0ec72d00fea9f31e03b375525601a8e6dc51731fde1da8f3a867",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Overdue_Notice_Bonus.jpg",
        "size": 326167,
        "sha256": "59a68343cd7deff4c1e67751762773574f8a1058afd2731a97f48609062905c3",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 272285,
        "sha256": "4eaa664aa3a3e03a89ecf80d8609f7132a76350a071a42a020a3d5234ba2b8a3",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 317511,
        "sha256": "9b676b3f4169bf964d6c58a242e0c8682ed2964d42f7eb6ec2f3db6c9570f870",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 336370,
        "sha256": "1fb58f9cf280b1ec6dae2b357659f733560c84dd87f7cd93c49bea5208f72591",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Invoice_Payment_Tracker_Listing_Video.mp4",
      "size": 287192,
      "sha256": "a42e5b96f50fcc415d9430c9cd6e9ae19edc9e5a972d07ad24b45ba85739f4e1",
      "mime": "video/mp4"
    }
  },
  "PDT-CRM-012": {
    "listingId": 4589550677,
    "zip": {
      "name": "PDT-CRM-012 Buyer Package FINAL CLEAN.zip",
      "size": 549312,
      "sha256": "8ad136bac5d505b34a6acdb87adfff4ed1ccdf513312a42fde3d7e15af58cc8e",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 391561,
        "sha256": "62e12ca2c42f21084ba1c55cb5a88927243eb55f0b6ae3babd03894fb2df99da",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 418114,
        "sha256": "82b7c74eec4f531ee69c3e1310cb31be3840c93aaed76d61b9de50e7e36bd80e",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 300551,
        "sha256": "889bb06a635845bad9cd1c7d980fa0018f9f8d7debbfe3246ae946f8b525a260",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Client_Database_Master.jpg",
        "size": 299841,
        "sha256": "f8b9a965cd95c8e23c31a912b4949b17ec9d9c78e3ac0280b0c18bc7c707a6e8",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Recurring_Board_Dispatch.jpg",
        "size": 299557,
        "sha256": "e0116c5cf46100d7ffd354dcdb06c9da3ccb19df03547c4314ecb539ffd74343",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Printable_Profile_Card.jpg",
        "size": 300005,
        "sha256": "f56a75e119b5b1e8dd9520b3e14f49025bedc9c24ab86b920a5fbd96ce6d15ea",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Retention_Review_Bonus.jpg",
        "size": 335477,
        "sha256": "a162df3aa32171ef54f05e1d96c0a3188d02fba8ea5da4b39daf3571bb9e8f5a",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 273526,
        "sha256": "552a6777152c95a3a8b7cabf55b944abc4eb62c230864dbc00e4c18f5d8e3e77",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 318561,
        "sha256": "bad07eb38a338a8b846921e2747c1e807443f78e46b4ef1019d2bd7a57527417",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 336415,
        "sha256": "b409256575c1c6bc20566a33d07e85e36fa79df90f2a9e689a97c29d0d7933af",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Client_CRM_Listing_Video.mp4",
      "size": 312867,
      "sha256": "9d8c7bcd662846cd0b69657ca995b49fc86108d0c417b116a8ca605456eeacef",
      "mime": "video/mp4"
    }
  },
  "PDT-ABT-013": {
    "listingId": 4589550767,
    "zip": {
      "name": "PDT-ABT-013 Buyer Package FINAL CLEAN.zip",
      "size": 761966,
      "sha256": "60b931d8fb9fbcaa1d26002f38939791f02ab1ae197a56150d0a06295074376a",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 435045,
        "sha256": "2d288049bf4b62951652660de61420e67dcbd50f59868cde74515c4e42b1e8ca",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 339460,
        "sha256": "d2de2e50528f35497323f54b823a57c0bf7e01156f236770f595eea461db5740",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Workbook_Overview.jpg",
        "size": 334499,
        "sha256": "4d5a631c619e036766c1161f52818b39dbfa1a50d277c6e237c1226a25cea641",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Turnover_Cleaning_Checklist.jpg",
        "size": 347615,
        "sha256": "2767d3d7ee62da245dc8d40497aca8fb4b94e704437e7444831e32ac88c27f29",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Supply_Par_Restock_Log.jpg",
        "size": 317063,
        "sha256": "690a0228027b16fea13c4bd28465daea368d7d5464810fd8fca2569768c8664c",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Linen_Laundry_Protocol.jpg",
        "size": 305021,
        "sha256": "66f7b2da1bf5f3003eb055169fe0405eba52e147a9d5ab70e8e53fd1cb1e2a07",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Printables_And_Bonus.jpg",
        "size": 332499,
        "sha256": "b3acc57ad4f6361d76cc4a45da09b6eb24d3477f4141fdbe62436f75fc49cda9",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Key_Features.jpg",
        "size": 331400,
        "sha256": "ed663397d27e0d93d0e8e10a62147bb35033fbce825e60bc3ec578f825c16a2b",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Before_You_Buy.jpg",
        "size": 348218,
        "sha256": "5e31f4318040319e9e5fd78c1f230c6aca8e9eef913ef8c89acda68f75b6051d",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Brand_Collection.jpg",
        "size": 366754,
        "sha256": "201347a52c05e7f4378882f54ae80dacb5bdfb1d662ae6c5add3b2b020c5edcd",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Airbnb_Turnover_Restock_Listing_Video.mp4",
      "size": 331957,
      "sha256": "49ba8d86713663e609f2533f93b3baa2748b982df319bd749ff966efdfd45e2c",
      "mime": "video/mp4"
    }
  },
  "PDT-CFB-014": {
    "listingId": 4589561140,
    "zip": {
      "name": "PDT-CFB-014 Buyer Package FINAL CLEAN.zip",
      "size": 822483,
      "sha256": "b1223c02614f37e595e11b2b30d8209f7b7c1798f5496ddfa3555d28c6183326",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 526047,
        "sha256": "0017707275732c54e22c624d88662c26fce19801594137ea1529f04689899bd0",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 427384,
        "sha256": "87d380173281f50b1a956a29f5af4ae7a752638d98dcc1ffbb96c127c0937658",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Intake_Quote_Forms.jpg",
        "size": 478591,
        "sha256": "afd3f5a3af66a110fc0f5d0b84b3098edbf18f46934afa2906a69f297053e56c",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Service_Agreement_Work_Order.jpg",
        "size": 498043,
        "sha256": "d8a70541534a1038818e03876778f1676b5bc84f5c193259a1a23ebd66642170",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Residential_Deep_Clean_Checklists.jpg",
        "size": 415989,
        "sha256": "aa337836b6c34bd3512ce731dfc46da9819b95fffeda57c756ed39174b3d8b5e",
        "mime": "image/jpeg"
      },
      {
        "name": "06_MoveOut_Commercial_Checklists.jpg",
        "size": 325246,
        "sha256": "a9bee21fc44c883848a2ff0fb0463d6307d7b1d3478020a90a6164b713a14f99",
        "mime": "image/jpeg"
      },
      {
        "name": "07_QualityControl_Supply_Feedback.jpg",
        "size": 461738,
        "sha256": "b861002c1eed88a195ae0809c24fdcdd020fb08af7d4e533be40ad75aff0094e",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Who_Its_For.jpg",
        "size": 434041,
        "sha256": "2160f04faef12dea1ece9f6e6866d86fb13bddebff540a854b2aa229b409611d",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Compatibility_Notes.jpg",
        "size": 416594,
        "sha256": "c5a14e7b63d5ad358581f0b533ba337259f615c72115a0d2c97e31fd9333576e",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Collection_Cross_Sell.jpg",
        "size": 395453,
        "sha256": "57e5680e1a45c29a529d3722526e277e3a6b2d39ed06b1f61aebe8324c676900",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Business_Forms_Listing_Video.mp4",
      "size": 368222,
      "sha256": "c88e8d61959ecdd447f3a1c9ab75f69b79b35d2e54b850f81edf847af1cfd1ad",
      "mime": "video/mp4"
    }
  },
  "PDT-CMK-015": {
    "listingId": 4589551011,
    "zip": {
      "name": "PDT-CMK-015 Buyer Package FINAL CLEAN.zip",
      "size": 958278,
      "sha256": "745e1cff12767e34a07f3483855f390a56cf2611657713b0b5af9a666a995d16",
      "mime": "application/zip"
    },
    "images": [
      {
        "name": "01_Hero.jpg",
        "size": 484775,
        "sha256": "e4adb1c9621d2b097981758f4b8d537d8ba89cc39aa6cb363f1ef0a070da2da1",
        "mime": "image/jpeg"
      },
      {
        "name": "02_What_You_Get.jpg",
        "size": 467567,
        "sha256": "fb65315ddb527d4cab8ebb3a65a29eb3de252eb690fd17b24d998d4104924af1",
        "mime": "image/jpeg"
      },
      {
        "name": "03_Lifecycle_Architecture_Map.jpg",
        "size": 407293,
        "sha256": "1a6d6e4e8042993d5af377231f306ece2d6a2f4920245a402203466b8384349c",
        "mime": "image/jpeg"
      },
      {
        "name": "04_Intake_Quoting_Engine.jpg",
        "size": 463919,
        "sha256": "078cd5bea5612322a12c44ac068904f3ec3fc3f3ef1a97193e91a993da096d67",
        "mime": "image/jpeg"
      },
      {
        "name": "05_Agreement_Dispatch_Board.jpg",
        "size": 485133,
        "sha256": "39776d76e224dddb7e1b6add0885fb7b6c8bb66e874d6e95be3caacf497b0c3b",
        "mime": "image/jpeg"
      },
      {
        "name": "06_Checklists_QC_Scorecard.jpg",
        "size": 457146,
        "sha256": "deca399814d3a2e99e4991b71138fc5a0578a96215434e3c1f188d086623c70a",
        "mime": "image/jpeg"
      },
      {
        "name": "07_Invoice_Aging_Ledger.jpg",
        "size": 456476,
        "sha256": "9436851b3099ed8f2c14ccedb14e0e5c67da9ee63009498a53eb45441704c365",
        "mime": "image/jpeg"
      },
      {
        "name": "08_Customer_Retention_Dashboard.jpg",
        "size": 475250,
        "sha256": "b2ebeef8e2c9d41cae17f3792ce7dfa3c9335ddff478fa08f81e3a354e2c23c3",
        "mime": "image/jpeg"
      },
      {
        "name": "09_Compatibility_Notes.jpg",
        "size": 440288,
        "sha256": "0f448a1cc9fd90c29d576e81fc0f64ef3179e0964381dc5e833b66031ebe9642",
        "mime": "image/jpeg"
      },
      {
        "name": "10_Collection_Cross_Sell.jpg",
        "size": 400272,
        "sha256": "8da3fb15302911010d5cc88ea68a5038027fef0570d28de9c10ffd1101140f0e",
        "mime": "image/jpeg"
      }
    ],
    "video": {
      "name": "Cleaning_Operations_Master_Kit_Listing_Video.mp4",
      "size": 372592,
      "sha256": "72de3d79faf4794e129e6525a64f96c45d6f3d137eb0fda6d954906e3e4e2b09",
      "mime": "video/mp4"
    }
  }
};
type Rec=Record<string,unknown>; function isRec(v:unknown):v is Rec{return typeof v==="object"&&v!==null&&!Array.isArray(v)}; function secure(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}; function sha(b:Buffer){return createHash("sha256").update(b).digest("hex")};
function authOk(req:NextRequest){const op=req.headers.get("x-operation-id")?.trim()??"",act=req.headers.get("x-auth-action")?.trim()??"",nonce=req.headers.get("x-operation-nonce")?.trim()??"";return op===OPERATION_ID&&act===AUTH_ACTION&&secure(sha(Buffer.from(nonce,"utf8")),NONCE_SHA256)}
function rows(v:unknown):Rec[]{return isRec(v)&&Array.isArray(v.results)?v.results.filter(isRec):[]}; async function j(r:Response){const t=await r.text();try{return t?JSON.parse(t):{}}catch{return {}}}; function mpHeaders(token:string){const h=etsyApiHeaders(token);delete h["content-type"];return h};
async function get(token:string,path:string){const r=await fetch("https://api.etsy.com/v3/application"+path,{headers:etsyApiHeaders(token),cache:"no-store"});if(!r.ok)throw new Error(`GET_${path}_HTTP_${r.status}`);return j(r)}; async function listing(t:string,id:number){return get(t,`/listings/${id}`)}; async function files(t:string,id:number){return rows(await get(t,`/shops/${SHOP_ID}/listings/${id}/files`))}; async function images(t:string,id:number){return rows(await get(t,`/listings/${id}/images`))}; async function videos(t:string,id:number){return rows(await get(t,`/listings/${id}/videos`))};
function catalog(pid:string){const s=DRAFT_CATALOG_04_15.find(x=>x.productId===pid);if(!s)throw new Error("PRODUCT_NOT_IN_CATALOG");return s}
async function protect(token:string,pid:string){const a=ASSETS[pid];if(!a)throw new Error("PRODUCT_NOT_AUTHORIZED");const gate=await enforceBuildGateForRoute(pid,"PDT_04_15_DRAFT_RECONCILE_ASSETS_R01");if(gate)throw new Error("PLAN_BUILD_GATE_BLOCKED");const st=await getEtsySellerStateSnapshot({shopId:SHOP_ID,accessToken:token});for(const [id,title] of PROTECTED){const x=st.listings.find(v=>v.listingId===id);if(!x||x.state!=="active"||x.title!==title)throw new Error(`PROTECTED_LISTING_DRIFT_${id}`)}const target=st.listings.find(v=>v.listingId===a.listingId);if(!target||target.state!=="draft")throw new Error("TARGET_NOT_DRAFT");return a}
function deliveryDescription(pid:string,desc:string){let x=desc;if(pid==="PDT-CBP-004")x=x.replace("When you download your package, you receive **5 comprehensive, fully formatted files**:","Your Etsy download is **1 CLEAN ZIP** containing these **5 comprehensive, fully formatted files**:").replace("*All 5 files are also packaged inside `PDT-CBP-004 Buyer Package FINAL CLEAN.zip` for quick, one-click extraction.*","*Etsy delivers `PDT-CBP-004 Buyer Package FINAL CLEAN.zip`; extract it to access all 5 files listed above.*");if(["PDT-CCP-007","PDT-CQE-008","PDT-CSC-009"].includes(pid))x=x.replace("Delivered immediately in 1 Clean ZIP archive + individual high-res deliverables:","Delivered as 1 Clean ZIP archive containing these 5 deliverables:");return x}
function normalizedPrice(v:unknown){if(isRec(v)){const a=Number(v.amount),d=Number(v.divisor);if(Number.isFinite(a)&&Number.isFinite(d)&&d>0)return a/d}return Number(v)}
function coreMatches(l:Rec,s:ReturnType<typeof catalog>){const tags=Array.isArray(l.tags)?l.tags.map(String):[];return String(l.state)==="draft"&&Number(l.shop_id)===SHOP_ID&&String(l.title)===s.title&&String(l.description)===deliveryDescription(s.productId,s.description)&&Math.abs(normalizedPrice(l.price)-s.priceUsd)<.001&&Number(l.quantity)===s.quantity&&Number(l.taxonomy_id)===s.taxonomyId&&JSON.stringify(tags)===JSON.stringify(s.tags)}
async function syncApprovedPlans(){
  const store=getProductPlanStore();
  const results=[];
  for(const plan of CANONICAL_PLANS_04_15){
    const planId=`PLAN-${plan.productId}-V1`;
    const qc=evaluateProductCreationPlanQC(plan);
    if(!qc.passed)throw new Error(`PLAN_SYNC_QC_FAILED:${plan.productId}`);
    const expectedSha=computePlanSha256(plan);
    let current=await store.getPlan(planId);
    if(!current){
      current=await store.savePlan(plan,planId);
    }else{
      if(current.productId!==plan.productId||current.planVersion!==1||current.planSha256!==expectedSha)throw new Error(`PLAN_SYNC_EXISTING_DRIFT:${plan.productId}`);
    }
    if(current.status!=="PLAN_APPROVED") current=await store.approvePlan(planId);
    const rb=await store.getPlan(planId);
    if(!rb||rb.status!=="PLAN_APPROVED"||rb.planSha256!==expectedSha)throw new Error(`PLAN_SYNC_READBACK_FAILED:${plan.productId}`);
    results.push({productId:plan.productId,planId,status:rb.status,planSha256:rb.planSha256,approvedAt:rb.approvedAt});
  }
  return results;
}
async function patchMetadata(token:string,pid:string){const a=await protect(token,pid),s=catalog(pid),before=await listing(token,a.listingId);if(!isRec(before)||String(before.state)!=="draft")throw new Error("PRE_METADATA_NOT_DRAFT");if(coreMatches(before,s))return {changed:false,listingId:a.listingId};const body=new URLSearchParams({title:s.title,description:deliveryDescription(pid,s.description),price:s.priceUsd.toFixed(2),quantity:String(s.quantity),who_made:s.whoMade,when_made:s.whenMade,taxonomy_id:String(s.taxonomyId),type:s.type,tags:s.tags.join(",")});const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${a.listingId}`,{method:"PATCH",headers:{...etsyApiHeaders(token),"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"});if(!r.ok)throw new Error(`METADATA_PATCH_HTTP_${r.status}:${(await r.text()).slice(0,200)}`);const after=await listing(token,a.listingId);if(!isRec(after)||!coreMatches(after,s))throw new Error("METADATA_READBACK_MISMATCH");return {changed:true,listingId:a.listingId}}
async function upload(token:string,pid:string,kind:string,rank:number,file:File){const a=await protect(token,pid);let spec:AssetSpec;if(kind==="zip")spec=a.zip;else if(kind==="image"){if(rank<1||rank>a.images.length)throw new Error("IMAGE_RANK_INVALID");spec=a.images[rank-1]}else if(kind==="video")spec=a.video;else throw new Error("ASSET_KIND_INVALID");if(file.name!==spec.name||file.size!==spec.size)throw new Error("ASSET_NAME_OR_SIZE_MISMATCH");const b=Buffer.from(await file.arrayBuffer());if(!secure(sha(b),spec.sha256))throw new Error("ASSET_SHA256_MISMATCH");if(kind==="zip"){const ex=await files(token,a.listingId);if(ex.length>0){if(ex.length===1&&String(ex[0].filename??"").replace(/\s+/g,"")===spec.name.replace(/\s+/g,"")&&Number(ex[0].size_bytes)===spec.size)return {changed:false};throw new Error("BUYER_FILES_ALREADY_PRESENT_RECONCILIATION_REQUIRED")}const f=new FormData();f.append("file",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);f.append("rank","1");const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${a.listingId}/files`,{method:"POST",headers:mpHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`ZIP_UPLOAD_HTTP_${r.status}:${(await r.text()).slice(0,160)}`);const rb=await files(token,a.listingId);if(rb.length!==1||Number(rb[0].size_bytes)!==spec.size)throw new Error("ZIP_READBACK_MISMATCH");return {changed:true}}
if(kind==="image"){const ex=await images(token,a.listingId);const hit=ex.find(x=>Number(x.rank)===rank);if(hit)return {changed:false,alreadyPresent:true};if(ex.length!==rank-1)throw new Error("IMAGE_SEQUENCE_RECONCILIATION_REQUIRED");const f=new FormData();f.append("image",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("rank",String(rank));const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${a.listingId}/images`,{method:"POST",headers:mpHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`IMAGE_UPLOAD_HTTP_${r.status}:${(await r.text()).slice(0,160)}`);const rb=await images(token,a.listingId);if(!rb.some(x=>Number(x.rank)===rank))throw new Error("IMAGE_READBACK_RANK_MISSING");return {changed:true}}
const ex=await videos(token,a.listingId);if(ex.some(x=>String(x.video_state??"")==="active"))return {changed:false,alreadyPresent:true};const f=new FormData();f.append("video",new File([new Uint8Array(b)],spec.name,{type:spec.mime}),spec.name);f.append("name",spec.name);const r=await fetch(`https://api.etsy.com/v3/application/shops/${SHOP_ID}/listings/${a.listingId}/videos`,{method:"POST",headers:mpHeaders(token),body:f,cache:"no-store"});if(!r.ok)throw new Error(`VIDEO_UPLOAD_HTTP_${r.status}:${(await r.text()).slice(0,160)}`);const rb=await videos(token,a.listingId);if(!rb.some(x=>String(x.video_state??"")==="active"))throw new Error("VIDEO_READBACK_MISSING");return {changed:true}}
async function snapshot(token:string,pid:string){const a=await protect(token,pid),s=catalog(pid),l=await listing(token,a.listingId),fi=await files(token,a.listingId),im=await images(token,a.listingId),vi=await videos(token,a.listingId);return {productId:pid,listingId:a.listingId,state:isRec(l)?String(l.state):"INVALID",metadataOk:isRec(l)&&coreMatches(l,s),buyerZipOk:fi.length===1&&String(fi[0].filename??"").replace(/\s+/g,"")===a.zip.name.replace(/\s+/g,"")&&Number(fi[0].size_bytes)===a.zip.size,fileCount:fi.length,imageCount:im.length,imageRanks:im.map(x=>Number(x.rank)).sort((p,q)=>p-q),videoCount:vi.filter(x=>String(x.video_state??"")==="active").length}}
export async function GET(req:NextRequest){try{const token=await getValidEtsyAccessToken(["listings_r"]),pid=req.nextUrl.searchParams.get("productId");if(pid)return NextResponse.json({status:"READ_ONLY",ETSY_WRITE_COUNT:0,...await snapshot(token,pid)});const out=[];for(const p of DRAFT_CATALOG_04_15)out.push(await snapshot(token,p.productId));return NextResponse.json({status:"READ_ONLY",ETSY_WRITE_COUNT:0,products:out})}catch(e){return NextResponse.json({status:"BLOCKED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:0},{status:409})}}
export async function POST(req:NextRequest){let writes=0;try{if(!authOk(req))throw new Error("EXACT_OPERATION_AUTHORIZATION_INVALID");const ct=req.headers.get("content-type")??"";if(ct.includes("application/json")){const b=await req.json() as {action?:string;productId?:string};if(b.action==="sync-approved-plans"){const plans=await syncApprovedPlans();return NextResponse.json({status:"APPROVED_PLANS_SYNCED_TO_DURABLE_STORE",plans,ETSY_WRITE_COUNT:0,noPublishEnforced:true})}if(b.action!=="metadata"||!b.productId)throw new Error("METADATA_REQUEST_INVALID");const token=await getValidEtsyAccessToken(["listings_r","listings_w"]);const r=await patchMetadata(token,b.productId);if(r.changed)writes++;return NextResponse.json({status:"DRAFT_METADATA_RECONCILED",productId:b.productId,listingId:r.listingId,ETSY_WRITE_COUNT:writes,noPublishEnforced:true})}const token=await getValidEtsyAccessToken(["listings_r","listings_w"]);const fd=await req.formData(),pid=String(fd.get("productId")??""),kind=String(fd.get("kind")??""),rank=Number(fd.get("rank")??0),file=fd.get("file");if(!(file instanceof File))throw new Error("FILE_REQUIRED");const r=await upload(token,pid,kind,rank,file);if(r.changed)writes++;return NextResponse.json({status:"DRAFT_ASSET_RECONCILED",productId:pid,kind,rank,ETSY_WRITE_COUNT:writes,noPublishEnforced:true})}catch(e){return NextResponse.json({status:writes?"PARTIAL_WRITE_RECONCILIATION_REQUIRED":"BLOCKED_FAIL_CLOSED",error:e instanceof Error?e.message:"UNKNOWN",ETSY_WRITE_COUNT:writes,noPublishEnforced:true},{status:writes?202:409})}}
