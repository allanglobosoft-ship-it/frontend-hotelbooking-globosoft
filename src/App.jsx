import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import Login from "./pages/Login";
import SelectRole from "./pages/SelectRole";
import Register from "./pages/Register";
import HotelRegisterFromOut from "./pages/HotelRegisterFromOut";
import HotelApproval from "./pages/HotelApproval";
import HotelApprovalDetail from "./pages/HotelApprovalDetail";
import AgentApproval from "./pages/AgentApproval";
import AgentApprovalDetail from "./pages/AgentApprovalDetail";

import Country from "./pages/master/Country";
import Destination from "./pages/master/Destination";
import Hotels from "./pages/master/Hotels";
import PrivateRoute from "./components/PrivateRoute";
import AgentDashboard from "./pages/AgentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import Test from "./pages/Test";
import LandingPage from "./pages/LandingPage";
import { Toaster } from "react-hot-toast";
import Designations from "./pages/master/Designation";
import HotelSearch from "./pages/HotelSearch";
import HotelSearch24Hour from "./pages/HotelSearch24Hour";
import HotelSearchReligious from "./pages/HotelSearchReligious";
import RoomList from "./pages/RoomList";
import HotelBookingList from "./pages/list/HotelBookingList";
import HotelBookingList24Hour from "./pages/list/HotelBookingList24Hour";
import ReligiousBookingList from "./pages/list/ReligiousBookingList";
import AllBookingsList from "./pages/list/AllBookingsList";
// Last Minute Booking — list page (Phase 4)
import LastMinuteBookingList from "./pages/list/LastMinuteBookingList";
import LastMinuteBookingDetailView from "./pages/list/LastMinuteBookingDetailView";
// 24 Hour Check-In configuration pages (new feature)
import Hotel24HourCheckin from "./pages/HotelActions/TwentyFourHourCheckin/Hotel24HourCheckin";
import Hotel24HourCheckinForm from "./pages/HotelActions/TwentyFourHourCheckin/Hotel24HourCheckinForm";
import BookingDetailedView from "./pages/list/BookingDetailedView";
import BookingEditPage from "./pages/list/BookingEditPage";
import BookingNotesPage from "./pages/list/BookingNotesPage";
import CustomBookingList from "./pages/list/CustomBookingList";
import CustomBookingDetailView from "./pages/list/CustomBookingDetailView";
import Bank from "./pages/master/Bank";
import ContactType from "./pages/master/ContactType";
import MarkupType from "./pages/master/MarkupType";
import CabType from "./pages/master/CabType";
import Currency from "./pages/master/Currency";
import HotelRegistrationActions from "./pages/HotelRegistrationActions";
import MarketType from "./pages/master/MarketType";
import Region from "./pages/master/Region";
import Province from "./pages/master/Province";
import CityMapping from "./pages/master/CityMapping";

// Transfer Location Mapping — master → i'way location translation screens.
// The hotel one is aliased because ./pages/master/HotelMapping (supplier
// hotel-inventory mapping) already owns the HotelMapping name below.
import TransferAirportMapping from "./pages/master/transferMapping/AirportMapping";
import TransferPlaceMapping from "./pages/master/transferMapping/PlaceMapping";
import TransferHotelMapping from "./pages/master/transferMapping/HotelMapping";

import MappedList from "./pages/master/MappedList";


import AgentReg from "./pages/Registration/AgentReg";
import HotelReg from "./pages/Registration/HotelReg";
import HotelList from "./pages/Registration/HotelList";
import EmployeeReg from "./pages/Registration/EmployeeReg";
import CabProviderReg from "./pages/Registration/CabProviderReg";
import CabRates from "./pages/Registration/CabRates";
import ActivityProviderReg from "./pages/Registration/ActivityProviderReg";
import ActivityRates from "./pages/Registration/ActivityRates";
import ActivityRateView from "./pages/Registration/ActivityRateView";
import PackageReg from "./pages/Registration/PackageReg";
import PackageDetailedView from "./pages/Registration/PackageDetailedView";
import PackageRates from "./pages/Registration/PackageRates";
import SupplierReg from "./pages/Registration/SupplierReg";
import CompulsoryEventsPage from "./pages/HotelActions/Compulsery/CompulsoryEventsPage";
import OccupancyAndMinimumLength from "./pages/HotelActions/OccupancyAndMinimumLength/OccupancyAndMinimumLength";
import HotelAvailability from "./pages/HotelActions/Availability/HotelAvailability";
import MakeUrOwnPackage from "./pages/search/MakeUrOwnPackage";
import Calendar from "./pages/Calendar";
import HotelCategory from "./pages/master/HotelCategory";
import HotelType from "./pages/master/HotelType";
import OccupancyType from "./pages/master/OccupancyType";
import SeasonType from "./pages/master/SeasonType";
import RoomCategory from "./pages/master/RoomCategory";
import RoomType from "./pages/master/RoomType";
import RoomAmenity from "./pages/master/RoomAmenity";
import HotelAmenity from "./pages/master/HotelAmenity";
import MealPlan from "./pages/master/MealPlan";
import MasterAgentCategory from "./pages/master/MasterAgentCategory";
import PackageCategory from "./pages/master/PackageCategory";
import PackageType from "./pages/master/PackageType";
import DayActivities from "./pages/master/DayActivities";
import ItineraryDetails from "./pages/master/ItineraryDetails";
import VisaDetails from "./pages/master/VisaDetails";
import TermsAndConditions from "./pages/master/TermsAndConditions";
import ValidityPage from "./pages/HotelActions/Validities/ValidityPage";
import IndividualHotelSearch from "./pages/HotelActions/IndividualHotelSearch";
import ContractRate from "./pages/HotelActions/ContractRate/ContractRate";
import Promotion from "./pages/HotelActions/Promotion/Promotion";
import PromotionHotelSearch from "./pages/promotion/PromotionHotelSearch";
import Policy from "./pages/HotelActions/Policy/Policy";
import CreateContractRate from "./pages/HotelActions/ContractRate/CreateContractRate";
import EditContractRate from "./pages/HotelActions/ContractRate/EditContractRate";
import CopyContractRate from "./pages/HotelActions/ContractRate/CopyContractRate";
import ViewContractRate from "./pages/HotelActions/ContractRate/ViewContractRate";
// Last Minute Contract Rate (Phase 1 of Last Minute Booking module)
import LastMinuteContractRate from "./pages/HotelActions/LastMinuteContractRate/LastMinuteContractRate";
import LastMinuteContractRateForm from "./pages/HotelActions/LastMinuteContractRate/LastMinuteContractRateForm";
import ViewLastMinuteContractRate from "./pages/HotelActions/LastMinuteContractRate/ViewLastMinuteContractRate";
// Last Minute Booking — search/listing page (Phase 2)
import LastMinuteBookingPage from "./pages/booking/LastMinuteBookingPage";
// Last Minute Booking — booking creation form (Phase 3)
import LastMinuteBookingForm from "./pages/booking/LastMinuteBookingForm";
// Last Minute Room List — opens in a new tab when "View Rooms" is clicked
import LastMinuteRoomList from "./pages/LastMinuteRoomList";
import LongStayContract from "./pages/HotelActions/LongStayContract/LongStayContract";
import CreateLongStayContract from "./pages/HotelActions/LongStayContract/CreateLongStayContract";
import EditLongStayContract from "./pages/HotelActions/LongStayContract/EditLongStayContract";
// Day Stay configuration & flow
import DayStayContract from "./pages/HotelActions/DayStay/DayStayContract";
import DayStayContractForm from "./pages/HotelActions/DayStay/DayStayContractForm";
import DayStaySearch from "./pages/search/daystay/DayStaySearch";
import DayStayRoomList from "./pages/roomlist/DayStayRoomList";
import DayStayBookingPage from "./pages/booking/daystay/DayStayBookingPage";
import DayStayBookingList from "./pages/list/DayStayBookingList";
import DayStayBookingDetailView from "./pages/list/DayStayBookingDetailView";
import OfferZone from "./pages/OfferZone";
import OfferImageUpload from "./pages/OfferImageUpload";
import Advertisements from "./pages/Advertisements";
import PromotionFlyer from "./pages/marketing/PromotionFlyer";
import AdvertisementDetailedView from "./pages/AdvertisementDetailedView";
import AgentAccounts from "./pages/inhouseAccounts/AgentAccounts";
import AgentsPaymentHistory from "./pages/inhouseAccounts/AgentsPaymentHistory";
import AgentsAutoGeneratedInvoice from "./pages/inhouseAccounts/AgentsAutoGeneratedInvoice";
import ExtranetHotelDashboard from "./pages/ExtranetHotelDashboard";
import SpecialRates from "./pages/HotelActions/Promotion/SpecialRates";
import EditSpecialRates from "./pages/HotelActions/Promotion/EditSpecialRates";
import DiscountPromotion from "./pages/HotelActions/Promotion/DiscountPromotion";
import EditDiscountPromotion from "./pages/HotelActions/Promotion/EditDiscountPromotion";
import StayPayPromotion from "./pages/HotelActions/Promotion/StayPayPromotion";
import EditStayPayPromotion from "./pages/HotelActions/Promotion/EditStayPayPromotion";
import PolicyUpdate from "./pages/HotelActions/Policy/PolicyUpdate";
import PolicyCreate from "./pages/HotelActions/Policy/PolicyCreate";
import CompanyProfile from "./pages/CompanyProfile";
import Profile from "./pages/Profile/Profile";
import ChangePassword from "./pages/Profile/ChangePassword";
import TwoFactorAuth from "./pages/Profile/TwoFactorAuth";
import Logout from "./pages/Profile/Logout";
import MakePkgCombineSearch from "./pages/search/MakePkgCombineSearch";
import AccomodationRoomList from "./pages/roomlist/makeyourownpkg/AccomodationRoomList";
import Invoice from "./pages/Invoice";
import MakePkgBookingPage from "./pages/roomlist/makeyourownpkg/MakePkgBookingPage";
// Parallel v2 flow — add-ons selected first, then search/cart/booking.
// Legacy components above are left untouched so the original flow still works.
import MakeUrOwnPackageV2 from "./pages/search/MakeUrOwnPackageV2";
import MakePkgAddOnsFirstPage from "./pages/search/MakePkgAddOnsFirstPage";
import MakePkgCombineSearchV2 from "./pages/search/MakePkgCombineSearchV2";
import MakePkgBookingPageV2 from "./pages/roomlist/makeyourownpkg/MakePkgBookingPageV2";
import MakeYourOwnPackageV2BookingList from "./pages/list/MakeYourOwnPackageV2BookingList";
import MakeYourOwnPackageV2BookingDetailView from "./pages/list/MakeYourOwnPackageV2BookingDetailView";
import MakePkgV3Form from "./pages/search/MakePkgV3Form";
import MakePkgV3Results from "./pages/search/MakePkgV3Results";
import MakePkgV3BookingPage from "./pages/roomlist/makeyourownpkg/MakePkgV3BookingPage";
import GenerateQuotationBooking from "./pages/roomlist/makeyourownpkg/GenerateQuotationBooking";
import QuotationBookingList from "./pages/roomlist/makeyourownpkg/QuotationBookingList";
import QuotationBookingPage from "./pages/roomlist/makeyourownpkg/QuotationBookingPage";

// :bar_chart: Reports
import ReportBooking from "./pages/report/BookingReport";
import CancellationReport from "./pages/report/CancellationReport";
import InventoryStatus from "./pages/report/InventoryStatus";
import HotelWise from "./pages/report/HotelWise";
import Accounts from "./pages/report/Accounts";
import DayWise from "./pages/report/DayWise";
import MonthlyWise from "./pages/report/MonthlyWise";
import Comparison from "./pages/report/Comparison";
import AgentWise from "./pages/report/AgentWise";
import ContractExpiryReport from "./pages/report/ContractExpiryReport";
import Contractrate from "./pages/report/Contractrate";
import UserReport from "./pages/report/UserReport";
import Stopsalereport from "./pages/report/Stopsalereport";
import UserLogins from "./pages/report/UserLogins";
import OfflineBookingDailySalesStatement from "./pages/report/OfflineBookingDailySalesStatement";
import OnlineDailySalesReport from "./pages/report/OnlineDailySalesReport";
import TimeLimitOnlineDailySalesReport from "./pages/report/TimeLimitOnlineDailySalesReport";
import ExternalApiRoomList from "./pages/ExternalApiRoomList";
import HotelBookingPage from "./pages/booking/HotelBookingPage";
import DummyPaymentPage from "./pages/booking/DummyPaymentPage";
import CCAvenueCheckoutPage from "./pages/booking/CCAvenueCheckoutPage";
import ApiBookingPageForHotels from "./pages/booking/ApiBookingPageForHotels";
import LongStaySearch from "./pages/search/LongStaySearch";
import LongStayBookingPage from "./pages/booking/LongStayBookingPage";
import LongStayBookingList from "./pages/list/LongStayBookingList";
import LongStayBookingDetailView from "./pages/list/LongStayBookingDetailView";
import LongStayRoomList from "./pages/LongStayRoomList";
import CopilotWidget from "./components/CopilotWidget";
import AiDashboard from "./pages/ai/AiDashboard";
import DemandForecast from "./pages/ai/DemandForecast";
import AgentBehavior from "./pages/ai/AgentBehavior";
import NoShowRisk from "./pages/ai/NoShowRisk";
// Admin-only "Unbooked Opportunities" report — reads hotel_search_history
// rows that never turned into a booking. Additive: no other page or
// route is touched.
import UnbookedOpportunities from "./pages/ai/UnbookedOpportunities";
import { CabSearch } from "./pages/search/cab/CabSearch";
import CabBookingPage from "./pages/booking/CabBookingPage";
import ActivitySearch from "./pages/search/activity/ActivitySearch";
import ActivityBookingPage from "./pages/booking/ActivityBookingPage";
import CabBookingList from "./pages/list/CabBookingList";
import CabBookingDetailView from "./pages/list/CabBookingDetailView";
import ActivityBookingList from "./pages/list/ActivityBookingList";
import ActivityBookingDetailView from "./pages/list/ActivityBookingDetailView";
import HotelMapping from "./pages/master/HotelMapping";
import HotelMappingBulkList from "./pages/master/HotelMappingBulkList";
import UnMappingCity from "./pages/master/UnMappingCity";
import BulkCityMapping from "./pages/master/BulkCityMapping";
import SubLocation from "./pages/master/SubLocation";
import Airport from "./pages/master/Airport";
import ExtranetImgUpload from "./pages/extranet/ExtranetImgUpload";
import ExtranetCalendar from "./pages/extranet/ExtranetCalendar";
import ExtranetOccupancyAndMinimumLength from "./pages/extranet/ExtranetOccupancyAndMinimumLength";
import ExtranetContractRate from "./pages/extranet/ExtranetContractRate";
import { EditIcon } from "lucide-react";
import EditExtranetContractRate from "./pages/extranet/EditExtranetContractRate";
import ExtranetCreateContractRate from "./pages/extranet/ExtranetCreateContractRate";
import ExtranetPolicy from "./pages/extranet/Extranet-Policy/ExtranetPolicy";
import ExtranetPolicyCreate from "./pages/extranet/Extranet-Policy/ExtranetPolicyCreate";
import ExtranetPolicyUpdate from "./pages/extranet/Extranet-Policy/ExtranetPolicyUpdate";
import ExtranetPromotion from "./pages/extranet/Extranet-Promotion/ExtranetPromotion";
import ExtranetSpecialRates from "./pages/extranet/Extranet-Promotion/ExtranetSpecialRates";
import ExtranetDiscountPromotion from "./pages/extranet/Extranet-Promotion/ExtranetDiscountPromotion";
import ExtranetStayPayPromotion from "./pages/extranet/Extranet-Promotion/ExtranetStayPayPromotion";
import ExtranetSpecialRateEdit from "./pages/extranet/Extranet-Promotion/EditSpecialRateExtranet";
import EditDiscountPromotionExtranet from "./pages/extranet/Extranet-Promotion/EditDiscountPromotionExtranet";
import EditStayPayPromotionExtranet from "./pages/extranet/Extranet-Promotion/EditStayPayPromotionExtranet";
import EditSpecialRateExtranet from "./pages/extranet/Extranet-Promotion/EditSpecialRateExtranet";
import PackageSearch from "./pages/search/package/PackageSearch";
import PackageBooking from "./pages/booking/packagebooking/PackageBooking";
import PackageCheckout from "./pages/booking/packagebooking/PackageCheckout";
import FetchNewHotels from "./pages/master/FetchNewHotels";
import PackageBookingList from "./pages/list/PackageBookingList";
import PackageBookingDetailView from "./pages/list/PackageBookingDetailView";
import OfflineSearch from "./pages/search/offline/OfflineSearch";
import OfflineBookingList from "./pages/list/OfflineBookingList";
import OfflineBookingDetailView from "./pages/list/OfflineBookingDetailView";
import SubUser from "./pages/Registration/agent/SubUser";
import SubAgent from "./pages/Registration/agent/SubAgent";

// Meet & Space — new feature (CRUD on hotel details + booking flow)
import MeetingSpaceManage from "./pages/HotelActions/MeetingSpace/MeetingSpaceManage";
import MeetAndSpaceSearch from "./pages/search/meetspace/MeetAndSpaceSearch";
import MeetAndSpaceBookingPage from "./pages/booking/meetspace/MeetAndSpaceBookingPage";
import MeetAndSpaceBookingList from "./pages/list/MeetAndSpaceBookingList";
import MeetAndSpaceBookingDetailView from "./pages/list/MeetAndSpaceBookingDetailView";
import MeetAndSpaceBookingEditPage from "./pages/list/MeetAndSpaceBookingEditPage";

// Restaurant Module
import RestaurantRegistration from "./pages/restaurant/RestaurantRegistration";
import RestaurantList from "./pages/restaurant/RestaurantList";
import RestaurantBookingList from "./pages/restaurant/RestaurantBookingList";
import RestaurantBookingDetailView from "./pages/restaurant/RestaurantBookingDetailView";
import RestaurantSearch from "./pages/restaurant/RestaurantSearch";
import RestaurantBooking from "./pages/restaurant/RestaurantBooking";
import RestaurantViewPage from "./pages/restaurant/RestaurantViewPage";
import RestaurantExtranetDashboard from "./pages/restaurant-extranet/RestaurantExtranetDashboard";
import RestaurantExtranetReservations from "./pages/restaurant-extranet/RestaurantExtranetReservations";
import RestaurantExtranetCalendar from "./pages/restaurant-extranet/RestaurantExtranetCalendar";
import RestaurantExtranetGallery from "./pages/restaurant-extranet/RestaurantExtranetGallery";
import RestaurantExtranetProfile from "./pages/restaurant-extranet/RestaurantExtranetProfile";
import RestaurantExtranetProfileEdit from "./pages/restaurant-extranet/RestaurantExtranetProfileEdit";

// Honeymoon Module
import HoneymoonRegistration from "./pages/honeymoon/HoneymoonRegistration";
import HoneymoonList from "./pages/honeymoon/HoneymoonList";
import HoneymoonSearch from "./pages/honeymoon/HoneymoonSearch";
import HoneymoonViewPage from "./pages/honeymoon/HoneymoonViewPage";
import HoneymoonBooking from "./pages/honeymoon/HoneymoonBooking";
import HoneymoonBookingList from "./pages/honeymoon/HoneymoonBookingList";
import HoneyMoonPackageRates from "./pages/honeymoon/HoneyMoonPackageRates";
import GovEmployeePromotion from "./pages/HotelActions/GovEmployeePromotion/GovEmployeePromotion";
import GovEmployeeSearch from "./pages/search/govemployee/GovEmployeeSearch";
import GovEmployeeRoomList from "./pages/roomlist/GovEmployeeRoomList";
import GovEmployeeBookingPage from "./pages/booking/govemployee/GovEmployeeBookingPage";
import GovEmployeeBookingList from "./pages/list/GovEmployeeBookingList";
import GovEmployeeBookingDetailView from "./pages/list/GovEmployeeBookingDetailView";
import StudentDiscountPromotion from "./pages/HotelActions/StudentDiscountPromotion/StudentDiscountPromotion";
import StudentSearch from "./pages/search/student/StudentSearch";
import StudentRoomList from "./pages/roomlist/StudentRoomList";
import StudentBookingPage from "./pages/booking/student/StudentBookingPage";
import StudentBookingList from "./pages/list/StudentBookingList";
import StudentBookingDetailView from "./pages/list/StudentBookingDetailView";
import SchefferDriverReg from "./pages/Registration/SchefferDriverReg";
import SchefferDriverRates from "./pages/Registration/SchefferDriverRates";
import { SchefferDriverSearch } from "./pages/search/schefferDriver/SchefferDriverSearch";
import SchefferDriverBookingPage from "./pages/booking/SchefferDriverBookingPage";
import SchefferDriverBookingList from "./pages/list/SchefferDriverBookingList";
import SchefferDriverBookingDetailView from "./pages/list/SchefferDriverBookingDetailView";
import AyurvedaRegistration from "./pages/ayurveda/AyurvedaRegistration";
import AyurvedaCentreManage from "./pages/ayurveda/AyurvedaCentreManage";
import AyurvedaSearch from "./pages/ayurveda/AyurvedaSearch";
import AyurvedaBookingList from "./pages/ayurveda/AyurvedaBookingList";
import IncentiveConfig from "./pages/incentive/IncentiveConfig";
import AgentIncentiveDashboard from "./pages/incentive/AgentIncentiveDashboard";
import IncentiveClaims from "./pages/incentive/IncentiveClaims";
import SeniorCitizenList from "./pages/HotelActions/SeniorCitizen/SeniorCitizenList";
import SeniorCitizenSearch from "./pages/search/seniorcitizen/SeniorCitizenSearch";
import SeniorCitizenRoomList from "./pages/roomlist/SeniorCitizenRoomList";
import SeniorCitizenBookingPage from "./pages/booking/seniorcitizen/SeniorCitizenBookingPage";
import SeniorCitizenBookingList from "./pages/list/SeniorCitizenBookingList";
import SeniorCitizenBookingDetailView from "./pages/list/SeniorCitizenBookingDetailView";
import PackageAddOnReg from "./pages/Registration/PackageAddOnReg";
import PackageAddOnRates from "./pages/Registration/PackageAddOnRates";
import RoomList24Hour from "./pages/RoomList24Hour";
import RoomListReligious from "./pages/RoomListReligious";
import HotelBookingPage24Hour from "./pages/booking/HotelBookingPage24Hour";
import HotelBookingPageReligious from "./pages/booking/HotelBookingPageReligious";
import AgentView from "./pages/Registration/AgentView";
import LongStayBookingNotesPage from "./pages/list/LongStayBookingNotesPage";
import CustomBookingNotesPage from "./pages/list/CustomBookingNotesPage";
import MakeYourOwnPackageV2BookingNotesPage from "./pages/list/MakeYourOwnPackageV2BookingNotesPage";
import CabBookingNotesPage from "./pages/list/CabBookingNotesPage";
import SchefferDriverBookingNotesPage from "./pages/list/SchefferDriverBookingNotesPage";
import DayStayBookingNotesPage from "./pages/list/DayStayBookingNotesPage";
import HotelBookingHistory from "./pages/report/HotelBookingHistory";

// Super Admin — API access control (external clients + per-endpoint permissions)
import ApiEndpointCatalog from "./pages/superadmin/apiaccess/ApiEndpointCatalog";
import ApiClientList from "./pages/superadmin/apiaccess/ApiClientList";
import ApiClientPermissionMatrix from "./pages/superadmin/apiaccess/ApiClientPermissionMatrix";

// Super Admin — encrypted credential vault (SUPER_ADMIN only on backend)
import CredentialGroupList from "./pages/superadmin/credentialvault/CredentialGroupList";
import CredentialGroupDetail from "./pages/superadmin/credentialvault/CredentialGroupDetail";

// Super Admin — Admin Management (bind ADMIN login → company)
import AdminList from "./pages/superadmin/adminmanagement/AdminList";

// Admin — per-API on/off + Test/Live credentials (scoped to admin's own company)
import AdminApiAccess from "./pages/admin/apiaccess/AdminApiAccess";

// Super Admin — per-role sidebar visibility (Assign Menu)
import AssignMenu from "./pages/master/AssignMenu";
import UserRoles from "./pages/master/UserRoles";
import LoginLogs from "./pages/user-management/LoginLogs";
import RoleAssign from "./pages/user-management/RoleAssign";

import FlightSearch from "./pages/search/flight/FlightSearch";
import FlightBestPriceCheck from "./pages/search/flight/FlightBestPriceCheck";
import FlightBookPlaceholder from "./pages/search/flight/FlightBookPlaceholder";
import FlightBookPage from "./pages/search/flight/FlightBookPage";
import FlightBookingList from "./pages/list/FlightBookingList";






export default function App() {
  return (
    <div>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/select-userRole" element={<SelectRole />} />
        <Route path="/register" element={<Register />} />
        <Route path="/hotel-register" element={<HotelRegisterFromOut />} />
        
       
     {/* Protected Routes */}
<Route
  path="/adminDashboard"
  element={
    <PrivateRoute>
      <AdminDashboard />
    </PrivateRoute>
  }
/>

        {/* Super Admin dashboard — dedicated surface with super-admin-
            appropriate content (governance, credentials, access control,
            platform-wide metrics). Backend guards still enforce actual
            permissions. */}
        <Route
          path="/superAdminDashboard"
          element={
            <PrivateRoute roles={["super_admin"]}>
              <SuperAdminDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/agentDashboard"
          element={
            <PrivateRoute>
              <AgentDashboard />
            </PrivateRoute>
          }
        />
       
        <Route
          path="/staffDashboard"
          element={
            <PrivateRoute>
              <StaffDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/extranetDashboard"
          element={
            <PrivateRoute>
              <ExtranetHotelDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/landingPage"
          element={
            <PrivateRoute>
              <LandingPage />
            </PrivateRoute>
          }
        />

        {/* Topbar profile  */}
        <Route path="/view-profile" element={<PrivateRoute><Profile /> </PrivateRoute> }/>
        <Route path="/change-password" element={<PrivateRoute><ChangePassword /> </PrivateRoute> }/>
        {/* Two-factor authentication is an agent-only feature — only agent
            logins are challenged for a second factor, so the enrolment page is
            scoped to them. The backend refuses non-agent callers as well. */}
        <Route path="/two-factor-authentication" element={<PrivateRoute roles={["agent"]}><TwoFactorAuth /> </PrivateRoute> }/>
        <Route path="/log-out" element={<PrivateRoute><Logout /> </PrivateRoute> }/>

        {/* Masters */}
        <Route path="/masters/designations" element={<PrivateRoute><Designations /></PrivateRoute>} />
        <Route path="/masters/bank" element={<PrivateRoute><Bank /></PrivateRoute>} />
        <Route path="/masters/user-roles" element={<PrivateRoute><UserRoles /></PrivateRoute>} />
        <Route path="/masters/contact-type" element={<PrivateRoute><ContactType /></PrivateRoute>} />
        <Route path="/masters/markup-type" element={<PrivateRoute><MarkupType /></PrivateRoute>} />
        <Route path="/masters/cab-type" element={<PrivateRoute><CabType /></PrivateRoute>} />
        <Route path="/masters/currency" element={<PrivateRoute><Currency /></PrivateRoute>} />
        <Route path="/masters/market-type" element={<PrivateRoute><MarketType /></PrivateRoute>} />
        <Route path="/masters/region" element={<PrivateRoute><Region /></PrivateRoute>} />
        <Route path="/masters/countries" element={<PrivateRoute><Country /></PrivateRoute>} />
        <Route path="/masters/states" element={<PrivateRoute><Province /></PrivateRoute>} />
        <Route path="/masters/destination" element={<PrivateRoute><Destination /></PrivateRoute>} />
        <Route path="/masters/sub-location" element={<PrivateRoute><SubLocation /></PrivateRoute>} />
        <Route path="/masters/airport" element={<PrivateRoute><Airport /></PrivateRoute>} />
        <Route path="/masters/city-mapping" element={<PrivateRoute><CityMapping /></PrivateRoute>} />
        <Route path="/masters/city-mapping-bulk" element={<PrivateRoute roles={["super_admin"]}><BulkCityMapping /></PrivateRoute>} />
        <Route path="/masters/city-unmapping" element={<PrivateRoute><UnMappingCity /></PrivateRoute>} />
        <Route path="/masters/hotel-category" element={<PrivateRoute><HotelCategory /></PrivateRoute>} />
        <Route path="/masters/hotel-type" element={<PrivateRoute><HotelType /></PrivateRoute>} />
        <Route path="/masters/occupancy-type" element={<PrivateRoute><OccupancyType /></PrivateRoute>} />
        <Route path="/masters/season-type" element={<PrivateRoute><SeasonType /></PrivateRoute>} />
        <Route path="/masters/room-category" element={<PrivateRoute><RoomCategory /></PrivateRoute>} />
        <Route path="/masters/room-types" element={<PrivateRoute><RoomType /></PrivateRoute>} />
        <Route path="/masters/hotel-amenity" element={<PrivateRoute><HotelAmenity /></PrivateRoute>} />
        <Route path="/masters/room-amenity" element={<PrivateRoute><RoomAmenity /></PrivateRoute>} />
        <Route path="/masters/meal-plans" element={<PrivateRoute><MealPlan /></PrivateRoute>} />
        <Route path="/masters/agent-category" element={<PrivateRoute><MasterAgentCategory /></PrivateRoute>} />
        <Route path="/masters/package-category" element={<PrivateRoute><PackageCategory /></PrivateRoute>} />
        <Route path="/masters/package-type" element={<PrivateRoute><PackageType /></PrivateRoute>} />
        <Route path="/masters/day-activity" element={<PrivateRoute><DayActivities /></PrivateRoute>} />
        <Route path="/masters/itinerary-details" element={<PrivateRoute><ItineraryDetails /></PrivateRoute>} />
        <Route path="/masters/visa-information" element={<PrivateRoute><VisaDetails /></PrivateRoute>} />
        <Route path="/masters/terms-and-conditions" element={<PrivateRoute><TermsAndConditions /></PrivateRoute>} />
        <Route path="/masters/hotel-mapping" element={<PrivateRoute><HotelMapping /></PrivateRoute>} />
        <Route path="/masters/transfer-airport-mapping" element={<PrivateRoute><TransferAirportMapping /></PrivateRoute>} />
        <Route path="/masters/transfer-place-mapping" element={<PrivateRoute><TransferPlaceMapping /></PrivateRoute>} />
        <Route path="/masters/transfer-hotel-mapping" element={<PrivateRoute><TransferHotelMapping /></PrivateRoute>} />
        <Route path="/masters/hotel-upcooming-mapped-list" element={<PrivateRoute><HotelMappingBulkList /></PrivateRoute>} />
        <Route path="/masters/fetch-new-hotels" element={<FetchNewHotels />} />
        <Route path="/masters/mapped-list" element={<PrivateRoute><MappedList /></PrivateRoute>} />
     
        {/* :bar_chart: Reports */}
        <Route path="/report/booking" element={<ReportBooking />} />
        <Route path="/report/cancellation" element={<CancellationReport />} />
        <Route path="/report/inventory-status" element={<InventoryStatus />} />
        <Route path="/report/hotel-wise" element={<HotelWise />} />
        <Route path="/report/accounts" element={<Accounts />} />
        <Route path="/report/day-wise" element={<DayWise />} />
        <Route path="/report/monthly-wise" element={<MonthlyWise />} />
        <Route path="/report/comparison" element={<Comparison />} />
        <Route path="/report/agent-wise" element={<AgentWise />} />
        <Route path="/report/contract-expiry" element={<ContractExpiryReport />} />
        <Route path="/report/contract-rate" element={<Contractrate />} />
        <Route path="/report/user-report" element={<UserReport />} />
        <Route path="/report/stop-sale" element={<Stopsalereport />} />
        <Route path="/report/user-logins" element={<UserLogins />} />
        <Route path="/report/offline-daily-sales" element={<OfflineBookingDailySalesStatement />} />
        <Route path="/report/online-daily-sales" element={<OnlineDailySalesReport />} />
        <Route path="/report/time-limit-daily-sales" element={<TimeLimitOnlineDailySalesReport />} />
        <Route path="/report/hotel-booking-history" element={<PrivateRoute roles={["admin"]}><HotelBookingHistory /></PrivateRoute>} />

        {/* Super Admin — API access control for external clients. Restricted
            to super_admin so an ADMIN login can neither see the menu (Sidebar)
            nor reach the route. Backend SuperAdminGuard still runs as a
            second layer of enforcement. */}
        <Route path="/super-admin/api-access/endpoints" element={<PrivateRoute roles={["super_admin"]}><ApiEndpointCatalog /></PrivateRoute>} />
        <Route path="/super-admin/api-access/clients" element={<PrivateRoute roles={["super_admin"]}><ApiClientList /></PrivateRoute>} />
        <Route path="/super-admin/api-access/clients/:clientId/permissions" element={<PrivateRoute roles={["super_admin"]}><ApiClientPermissionMatrix /></PrivateRoute>} />

        {/* Super Admin — encrypted Credential Vault. Strictly SUPER_ADMIN on
            both sides: backend SuperAdminOnlyGuard rejects ADMIN with 403,
            and PrivateRoute now blocks the client route the same way so an
            ADMIN never even sees the shell. */}
        <Route path="/super-admin/credential-vault" element={<PrivateRoute roles={["super_admin"]}><CredentialGroupList /></PrivateRoute>} />
        <Route path="/super-admin/credential-vault/groups/:groupId" element={<PrivateRoute roles={["super_admin"]}><CredentialGroupDetail /></PrivateRoute>} />

        {/* Super Admin — bind ADMIN logins to a company. Agents the admin
            creates inherit the company on their own UserAccount, driving
            the per-company supplier restriction at hotel-search time. */}
        <Route path="/super-admin/admins" element={<PrivateRoute roles={["super_admin"]}><AdminList /></PrivateRoute>} />

        {/* Admin — per-API on/off overlay + Test/Live credentials. The
            backend AdminApiAccessGuard also runs, so a direct URL from a
            non-ADMIN account gets 403 even if this PrivateRoute passes. */}
        <Route path="/admin/api-access" element={<PrivateRoute roles={["admin"]}><AdminApiAccess /></PrivateRoute>} />

       {/* Super Admin — per-role sidebar visibility. Backend guards with
            SuperAdminOnlyGuard so a direct URL from a non-super_admin
            account gets 403 even if this PrivateRoute passes. */}
        <Route path="/masters/user-roles" element={<PrivateRoute roles={["super_admin"]}><UserRoles /></PrivateRoute>} />

      
        {/* Super Admin — per-role sidebar visibility. Backend guards with
            SuperAdminOnlyGuard so a direct URL from a non-super_admin
            account gets 403 even if this PrivateRoute passes. */}
        <Route path="/masters/assign-menu" element={<PrivateRoute roles={["super_admin"]}><AssignMenu /></PrivateRoute>} />

        {/* Super Admin — User Management group (sidebar: after Super Admin
            Dashboard). Both endpoints are super_admin-only in the backend
            via SuperAdminOnlyGuard, so the PrivateRoute role gate mirrors
            that surface. */}
        <Route path="/user-management/login-logs" element={<PrivateRoute roles={["super_admin"]}><LoginLogs /></PrivateRoute>} />
        <Route path="/user-management/role-assign" element={<PrivateRoute roles={["super_admin"]}><RoleAssign /></PrivateRoute>} />

       {/* New Booking */}
        <Route path="/new-booking/hotel" element={<PrivateRoute><HotelSearch /></PrivateRoute>} /> 
        {/* Dedicated 24-Hour Check-In hotel search — same component as
            /new-booking/hotel but with `force24Hour` so it always runs
            in 24-hour mode (toggle hidden, time pickers visible, probe
            + uplift always applied). Keeps the normal route untouched. */}
        <Route path="/new-booking/hotel-24hr" element={<PrivateRoute><HotelSearch24Hour /></PrivateRoute>} />
        {/* Dedicated Religious hotel-search — thin wrapper on HotelSearch
            with `religiousMode` prop so the destination picker is locked
            to Mecca + Medina and downstream routes stay religious-only.
            Normal /new-booking/hotel is untouched. */}
        <Route path="/new-booking/religious" element={<PrivateRoute><HotelSearchReligious /></PrivateRoute>} />


         <Route path="/new-booking/flight" element={<PrivateRoute><FlightSearch/></PrivateRoute>} />
         {/* Fare Details / Best Price Check — reached from the "View Fares"
             button on each flight search-result card. Selected recommendation
             is passed via React Router state so the URL stays clean. */}
         <Route path="/new-booking/flightBestPriceCheck" element={<PrivateRoute><FlightBestPriceCheck/></PrivateRoute>} />
         {/* Flight booking form — placeholder for the upcoming flow.
             Both routes point at the same placeholder for now:
             - /new-booking/flightBook was the initial placeholder path
             - /new-booking/flightBookPage is what Book Now on
               /new-booking/flightBestPriceCheck currently navigates to,
               and is the eventual home of the real passenger-form page.
             Keeping both wired ensures neither link 404s while the real
             page is under construction. */}
         {/* /new-booking/flightBook stays on the placeholder for backwards
             compat; the real booking form lives at /flightBookPage — that's
             where "Book Now" on the Fare Details page navigates. */}
         <Route path="/new-booking/flightBook" element={<PrivateRoute><FlightBookPlaceholder/></PrivateRoute>} />
         <Route path="/new-booking/flightBookPage" element={<PrivateRoute><FlightBookPage/></PrivateRoute>} />
        {/* Dedicated 24-Hour Check-In room list + booking page — same
            components as /room-list and /hotel-booking-page but with
            `force24Hour` so the post-rate-pick navigation and the
            post-booking redirect target the 24-hour-specific routes. */}
        <Route path="/room-list-24hr" element={<PrivateRoute><RoomList24Hour /></PrivateRoute>} />
        <Route path="/hotel-booking-page-24hr" element={<PrivateRoute><HotelBookingPage24Hour /></PrivateRoute>} />
        {/* Religious room list + booking page — same components as
            /room-list and /hotel-booking-page but with `religiousMode`
            so create writes isReligiousBooking=true and success
            redirects to /booking-details/religious-booking-list. */}
        <Route path="/religious-room-list" element={<PrivateRoute><RoomListReligious /></PrivateRoute>} />
        <Route path="/religious-booking-page" element={<PrivateRoute><HotelBookingPageReligious /></PrivateRoute>} />
        {/* Last Minute Booking (Phase 2) — separate search flow */}
        <Route path="/new-booking/last-minute-booking" element={<PrivateRoute><LastMinuteBookingPage /></PrivateRoute>} />
        {/* Last Minute Booking (Phase 3) — booking creation form */}
        <Route path="/new-booking/last-minute-booking/create" element={<PrivateRoute><LastMinuteBookingForm /></PrivateRoute>} />
        {/* Last Minute Room List — opened from "View Rooms" button on the search page */}
        <Route path="/last-minute-room-list" element={<PrivateRoute><LastMinuteRoomList /></PrivateRoute>} />
        <Route path="/hotel-booking-page" element={<PrivateRoute><HotelBookingPage /></PrivateRoute>} />
        <Route path="/payment/:gateway" element={<PrivateRoute><DummyPaymentPage /></PrivateRoute>} />
        <Route path="/payment/ccavenue-redirect" element={<PrivateRoute><CCAvenueCheckoutPage /></PrivateRoute>} />
        <Route path="/new-booking/long-stay" element={<PrivateRoute><LongStaySearch /></PrivateRoute>} />
        <Route path="/long-stay-booking-page" element={<PrivateRoute><LongStayBookingPage /></PrivateRoute>} />
        <Route path="/booking-details/long-stay-booking-list" element={<PrivateRoute><LongStayBookingList /></PrivateRoute>} />
        <Route path="/booking-details/long-stay-booking/:id" element={<PrivateRoute><LongStayBookingDetailView /></PrivateRoute>} />
        <Route path="/booking-details/long-stay-booking/:id/notes" element={<PrivateRoute><LongStayBookingNotesPage /></PrivateRoute>} />
        <Route path="/booking-details/day-stay-booking/:id/notes" element={<PrivateRoute><DayStayBookingNotesPage /></PrivateRoute>} />
        <Route path="/booking-details/custom-booking/:id/notes" element={<PrivateRoute><CustomBookingNotesPage /></PrivateRoute>} />
        <Route path="/booking-details/make-your-own-package-v2/:id/notes" element={<PrivateRoute><MakeYourOwnPackageV2BookingNotesPage /></PrivateRoute>} />
        <Route path="/booking-details/cab-booking/:id/notes" element={<PrivateRoute><CabBookingNotesPage /></PrivateRoute>} />
        <Route path="/booking-details/scheffer-driver-booking/:id/notes" element={<PrivateRoute><SchefferDriverBookingNotesPage /></PrivateRoute>} />
        <Route path="/long-stay-room-list" element={<PrivateRoute><LongStayRoomList /></PrivateRoute>} />
        <Route path="/ai" element={<PrivateRoute><AiDashboard /></PrivateRoute>} />
        <Route path="/ai/demand-forecast" element={<PrivateRoute><DemandForecast /></PrivateRoute>} />
        <Route path="/ai/agent-behavior" element={<PrivateRoute><AgentBehavior /></PrivateRoute>} />
        <Route path="/ai/no-show-risk" element={<PrivateRoute><NoShowRisk /></PrivateRoute>} />
        {/* Admin-only report — sidebar hides it for non-admin roles; the
            backend endpoint returns 403 for non-admins as a second gate. */}
        <Route path="/admin/unbooked-opportunities" element={<PrivateRoute><UnbookedOpportunities /></PrivateRoute>} />
        <Route path="/api-booking-page-hotels" element={<PrivateRoute><ApiBookingPageForHotels /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package" element={<PrivateRoute><MakeUrOwnPackage /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package/booking-page" element={<PrivateRoute><MakePkgBookingPage /></PrivateRoute>} />
        <Route path="/room-list" element={<PrivateRoute><RoomList /></PrivateRoute>} /> 
        <Route path="/api-room-list" element={<PrivateRoute><ExternalApiRoomList /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package/search" element={<PrivateRoute><MakePkgCombineSearch /></PrivateRoute>} />
        {/* v2 flow — add-ons first, then search, cart, booking */}
        <Route path="/new-booking/make-your-own-package-v2" element={<PrivateRoute><MakeUrOwnPackageV2 /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package-v2/addons" element={<PrivateRoute><MakePkgAddOnsFirstPage /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package-v2/search" element={<PrivateRoute><MakePkgCombineSearchV2 /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package-v2/booking-page" element={<PrivateRoute><MakePkgBookingPageV2 /></PrivateRoute>} />
        <Route path="/booking-details/make-your-own-package-v2-list" element={<PrivateRoute><MakeYourOwnPackageV2BookingList /></PrivateRoute>} />
        <Route path="/booking-details/make-your-own-package-v2/:id" element={<PrivateRoute><MakeYourOwnPackageV2BookingDetailView /></PrivateRoute>} />
        {/* v3 unified-search flow */}
        <Route path="/new-booking/make-your-own-package-v3" element={<PrivateRoute><MakePkgV3Form /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package-v3/results" element={<PrivateRoute><MakePkgV3Results /></PrivateRoute>} />
        <Route path="/new-booking/make-your-own-package-v3/booking" element={<PrivateRoute><MakePkgV3BookingPage /></PrivateRoute>} />
        {/* Unified "All Bookings" list — new, additive page + endpoint;
            combines all 8 booking types into one list, does not touch
            any existing per-type list route below. */}
        <Route path="/booking-details/all-bookings-list" element={<PrivateRoute><AllBookingsList /> </PrivateRoute>}/>
        <Route path="/booking-details/hotel-booking-list" element={<PrivateRoute><HotelBookingList /> </PrivateRoute>}/>
        {/* Dedicated 24-Hour Check-In booking list — same component as
            /booking-details/hotel-booking-list but with `force24HourOnly`
            so only bookings flagged is24HourCheckin=true are shown. */}
        <Route path="/booking-details/24hr-booking-list" element={<PrivateRoute><HotelBookingList24Hour /> </PrivateRoute>}/>
        {/* Religious booking list — same component as /hotel-booking-list
            with `religiousOnly` so only isReligiousBooking=true rows
            surface here (and are excluded from the standard list). */}
        <Route path="/booking-details/religious-booking-list" element={<PrivateRoute><ReligiousBookingList /> </PrivateRoute>}/>

        <Route path="/booking-details/flight-booking-list" element={<PrivateRoute><FlightBookingList/> </PrivateRoute>}/>
        {/* Last Minute Bookings list — view + cancel from this page */}
        <Route path="/booking-details/last-minute-booking-list" element={<PrivateRoute><LastMinuteBookingList /></PrivateRoute>}/>
        {/* Last-minute bookings are the same HotelBooking entity, so their
            detail view reuses the full hotel BookingDetailedView — identical
            UI + all action buttons, all operating on the booking by id. The
            old LastMinuteBookingDetailView remains in the repo but is no
            longer routed. */}
        <Route path="/booking-details/last-minute-booking/:id" element={<PrivateRoute><BookingDetailedView /></PrivateRoute>}/>
        <Route path="/booking-details/hotel-booking/:id" element={<PrivateRoute><BookingDetailedView /></PrivateRoute>}/>
        <Route path="/booking-details/hotel-booking/:id/edit" element={<PrivateRoute><BookingEditPage /></PrivateRoute>}/>
        <Route path="/booking-details/hotel-booking/:id/notes" element={<PrivateRoute><BookingNotesPage /></PrivateRoute>}/>
        <Route path="/booking-details/custom-booking-list" element={<PrivateRoute><CustomBookingList /> </PrivateRoute>}/>
        <Route path="/booking-details/custom-booking/:id" element={<PrivateRoute><CustomBookingDetailView /></PrivateRoute>}/>
        <Route path="/make-your-pkg-room-list" element={<PrivateRoute><AccomodationRoomList /> </PrivateRoute>}/>
        <Route path="/make-your-own-package/generate-quotation-booking" element={<PrivateRoute><GenerateQuotationBooking /> </PrivateRoute>}/>
        <Route path="/make-your-own-package/confirm-quotation-bookingpage" element={<PrivateRoute><QuotationBookingPage /> </PrivateRoute>}/>
        <Route path="/booking-details/quotation-booking-list" element={<PrivateRoute><QuotationBookingList /> </PrivateRoute>}/>
        <Route path="/new-booking/cab" element={<PrivateRoute><CabSearch /> </PrivateRoute>}/>
        <Route path="/cab-booking-page" element={<PrivateRoute><CabBookingPage /> </PrivateRoute>}/>
        <Route path="/new-booking/tours-and-activities" element={<PrivateRoute><ActivitySearch /> </PrivateRoute>}/>
        <Route path="/new-booking/tours-and-activities/booking" element={<PrivateRoute><ActivityBookingPage /> </PrivateRoute>}/>

        <Route path="/new-booking/package-search" element={<PrivateRoute><PackageSearch /> </PrivateRoute>}/>
        <Route path="/new-booking/package-booking/:id" element={<PrivateRoute><PackageBooking /> </PrivateRoute>}/>
        <Route path="/new-booking/package-checkout/:id" element={<PrivateRoute><PackageCheckout /> </PrivateRoute>}/>
        
        <Route path="/new-booking/offline-search" element={<PrivateRoute><OfflineSearch /> </PrivateRoute>}/>
        

        {/* Booking List/Details */}
        <Route path="/booking-details/cab-booking-list" element={<PrivateRoute><CabBookingList /></PrivateRoute>} />
        <Route path="/booking-details/cab-booking/:id" element={<PrivateRoute><CabBookingDetailView /></PrivateRoute>} />
        <Route path="/booking-details/activity-booking-list" element={<PrivateRoute><ActivityBookingList /></PrivateRoute>} />
        <Route path="/booking-details/activity-booking/:id" element={<PrivateRoute><ActivityBookingDetailView /></PrivateRoute>} />
        <Route path="/booking-details/package-booking-list" element={<PrivateRoute><PackageBookingList /></PrivateRoute>} />
        <Route path="/booking-details/package-booking/:id" element={<PrivateRoute><PackageBookingDetailView /></PrivateRoute>} />
        <Route path="/booking-details/offline-booking-list" element={<PrivateRoute><OfflineBookingList /></PrivateRoute>} />
        <Route path="/booking-details/offline-booking/:id" element={<PrivateRoute><OfflineBookingDetailView /></PrivateRoute>} />
        {/* Hotel Approval — admin only */}
        <Route path="/admin/approval/hotels" element={<PrivateRoute><HotelApproval /></PrivateRoute>} />
        <Route path="/admin/approval/hotels/:id" element={<PrivateRoute><HotelApprovalDetail /></PrivateRoute>} />

        {/* Agent Approval — admin only */}
        <Route path="/admin/approval/agents" element={<PrivateRoute><AgentApproval /></PrivateRoute>} />
        <Route path="/admin/approval/agents/:id" element={<PrivateRoute><AgentApprovalDetail /></PrivateRoute>} />

        {/* Company Profile */}
        <Route path="/company-profile" element={<PrivateRoute><CompanyProfile /></PrivateRoute>} />

        {/* Registration */}
        <Route path="/registration/agent" element={<PrivateRoute><AgentReg /></PrivateRoute>} />
        <Route path="/registration/agent/view/:id" element={<PrivateRoute><AgentView/></PrivateRoute>} />
        <Route path="/agent-registration/sub-user" element={<PrivateRoute><SubUser /></PrivateRoute>} />
        <Route path="/agent-registration/sub-agent" element={<PrivateRoute><SubAgent /></PrivateRoute>} />
        <Route path="/registration/employee" element={<PrivateRoute><EmployeeReg /></PrivateRoute>} />
        <Route path="/registration/cabProvider" element={<PrivateRoute><CabProviderReg /></PrivateRoute>} />
        <Route path="/cab-rates" element={<PrivateRoute><CabRates /></PrivateRoute>} />
        <Route path="/registration/activityProvider" element={<PrivateRoute><ActivityProviderReg /></PrivateRoute>} />
        <Route path="/activity-rates" element={<PrivateRoute><ActivityRates /></PrivateRoute>} />
        <Route path="/registration/activity-rate/view/:id" element={<PrivateRoute><ActivityRateView /></PrivateRoute>} />
        <Route path="/registration/package" element={<PrivateRoute><PackageReg /></PrivateRoute>} />
        <Route path="/registration/package/view/:id" element={<PrivateRoute><PackageDetailedView /></PrivateRoute>} />
        <Route path="/package-rates" element={<PrivateRoute><PackageRates /></PrivateRoute>} />
        <Route path="/registration/supplier" element={<PrivateRoute><SupplierReg /></PrivateRoute>} />
        <Route path="/registration/hotel" element={<PrivateRoute><HotelList /></PrivateRoute>} />
        <Route path="/registration/hotel/create" element={<PrivateRoute><HotelReg /></PrivateRoute>} />
        <Route path="/registration/hotel/create/:id" element={<PrivateRoute><HotelReg /></PrivateRoute>} />

        {/* Scheffer Driver and Limousine (single combined feature) */}
        <Route path="/registration/schefferDriver" element={<PrivateRoute><SchefferDriverReg /></PrivateRoute>} />
        <Route path="/scheffer-driver-rates" element={<PrivateRoute><SchefferDriverRates /></PrivateRoute>} />
        <Route path="/new-booking/scheffer-driver" element={<PrivateRoute><SchefferDriverSearch /></PrivateRoute>} />
        <Route path="/scheffer-driver-booking-page" element={<PrivateRoute><SchefferDriverBookingPage /></PrivateRoute>} />
        <Route path="/booking-details/scheffer-driver-booking-list" element={<PrivateRoute><SchefferDriverBookingList /></PrivateRoute>} />
        <Route path="/booking-details/scheffer-driver-booking/:id" element={<PrivateRoute><SchefferDriverBookingDetailView /></PrivateRoute>} />

        {/* MYOP Package Add-Ons (dynamic catalog used by /new-booking/make-your-own-package-v2/search) */}
        <Route path="/registration/package-addons" element={<PrivateRoute><PackageAddOnReg /></PrivateRoute>} />
        <Route path="/package-addons-rates/:addonId" element={<PrivateRoute><PackageAddOnRates /></PrivateRoute>} />
                
        
        {/* Restaurant Module */}
        <Route path="/restaurant/register" element={<PrivateRoute><RestaurantRegistration /></PrivateRoute>} />
        <Route path="/restaurant/edit/:id" element={<PrivateRoute><RestaurantRegistration /></PrivateRoute>} />
        <Route path="/restaurant/list" element={<PrivateRoute><RestaurantList /></PrivateRoute>} />
        <Route path="/restaurant/view/:id" element={<PrivateRoute><RestaurantViewPage /></PrivateRoute>} />
        <Route path="/booking-details/restaurant-booking-list" element={<PrivateRoute><RestaurantBookingList /></PrivateRoute>} />
        <Route path="/booking-details/restaurant-booking/:id" element={<PrivateRoute><RestaurantBookingDetailView /></PrivateRoute>} />
        <Route path="/new-booking/restaurant" element={<PrivateRoute><RestaurantSearch /></PrivateRoute>} />
        <Route path="/new-booking/restaurant/booking" element={<PrivateRoute><RestaurantBooking /></PrivateRoute>} />

        {/* Restaurant Extranet — restaurant managers log in through the
            standard /login page (UserAccount-backed, RESTAURANT_EXTRANET
            role). DashboardRedirections routes them to the dashboard;
            each page below shares a layout chrome that calls /me to
            resolve the restaurantId and guards against missing tokens.
            All inner data calls go via /api/restaurant-extranet/** and
            are scoped server-side by the JWT's username → UserAccount
            → userId resolution. */}
        <Route path="/restaurant-extranet/dashboard" element={<RestaurantExtranetDashboard />} />
        <Route path="/restaurant-extranet/reservations" element={<RestaurantExtranetReservations />} />
        <Route path="/restaurant-extranet/calendar" element={<RestaurantExtranetCalendar />} />
        <Route path="/restaurant-extranet/gallery" element={<RestaurantExtranetGallery />} />
        <Route path="/restaurant-extranet/profile" element={<RestaurantExtranetProfile />} />
        <Route path="/restaurant-extranet/profile/edit" element={<RestaurantExtranetProfileEdit />} />

        {/* Honeymoon Package Module */}
        <Route path="/honeymoon/register" element={<PrivateRoute><HoneymoonRegistration /></PrivateRoute>} />
        <Route path="/honeymoon/edit/:id" element={<PrivateRoute><HoneymoonRegistration /></PrivateRoute>} />
        <Route path="/honeymoon/list" element={<PrivateRoute><HoneymoonList /></PrivateRoute>} />
        <Route path="/honeymoon/view/:id" element={<PrivateRoute><HoneymoonViewPage /></PrivateRoute>} />
        <Route path="/honeymoon/book" element={<PrivateRoute><HoneymoonBooking /></PrivateRoute>} />
        <Route path="/honeymoon/package-rates/:id" element={<PrivateRoute><HoneyMoonPackageRates /></PrivateRoute>} />
        <Route path="/new-booking/honeymoon" element={<PrivateRoute><HoneymoonSearch /></PrivateRoute>} />
        <Route path="/booking-details/honeymoon-booking-list" element={<PrivateRoute><HoneymoonBookingList /></PrivateRoute>} />

        {/* Government Employee Booking Module — parallel flow */}
        {/* Per-hotel gov-employee discount config (opens from hotel-details) */}
        <Route path="/hotel-actions/:id/gov-employee-promotion" element={<PrivateRoute><GovEmployeePromotion /></PrivateRoute>} />
        {/* New-Booking flow — search → room-list → booking-page */}
        <Route path="/new-booking/gov-employee" element={<PrivateRoute><GovEmployeeSearch /></PrivateRoute>} />
        <Route path="/gov-employee-room-list" element={<PrivateRoute><GovEmployeeRoomList /></PrivateRoute>} />
        <Route path="/gov-employee-booking-page" element={<PrivateRoute><GovEmployeeBookingPage /></PrivateRoute>} />
        {/* Booking list + view (cancel/voucher live inside the list) */}
        <Route path="/booking-details/gov-employee-booking-list" element={<PrivateRoute><GovEmployeeBookingList /></PrivateRoute>} />
        <Route path="/booking-details/gov-employee-booking/:id" element={<PrivateRoute><GovEmployeeBookingDetailView /></PrivateRoute>} />

        {/* Student Booking Module — parallel flow */}
        {/* Per-hotel student discount config (opens from hotel-details) */}
        <Route path="/hotel-actions/:id/student-discount" element={<PrivateRoute><StudentDiscountPromotion /></PrivateRoute>} />
        {/* New-Booking flow — search → room-list → booking-page */}
        <Route path="/new-booking/student" element={<PrivateRoute><StudentSearch /></PrivateRoute>} />
        <Route path="/student-room-list" element={<PrivateRoute><StudentRoomList /></PrivateRoute>} />
        <Route path="/student-booking-page" element={<PrivateRoute><StudentBookingPage /></PrivateRoute>} />
        {/* Booking list + detail view */}
        <Route path="/booking-details/student-booking-list" element={<PrivateRoute><StudentBookingList /></PrivateRoute>} />
        <Route path="/booking-details/student-booking/:id" element={<PrivateRoute><StudentBookingDetailView /></PrivateRoute>} />
        {/* Admin verification now lives inline on the StudentBookingList page. */}

        {/* Senior Citizen Booking Module — parallel flow */}
        {/* Master CRUD + per-hotel promotion (opens from hotel-details) */}
        <Route path="/hotel-actions/:id/senior-citizen" element={<PrivateRoute><SeniorCitizenList /></PrivateRoute>} />
        {/* New-Booking flow — search → room-list → booking-page */}
        <Route path="/new-booking/senior-citizen" element={<PrivateRoute><SeniorCitizenSearch /></PrivateRoute>} />
        <Route path="/senior-citizen-room-list" element={<PrivateRoute><SeniorCitizenRoomList /></PrivateRoute>} />
        <Route path="/senior-citizen-booking-page" element={<PrivateRoute><SeniorCitizenBookingPage /></PrivateRoute>} />
        {/* Booking list + detail view */}
        <Route path="/booking-details/senior-citizen-booking-list" element={<PrivateRoute><SeniorCitizenBookingList /></PrivateRoute>} />
        <Route path="/booking-details/senior-citizen-booking/:id" element={<PrivateRoute><SeniorCitizenBookingDetailView /></PrivateRoute>} />


        {/* Ayurveda Module — standalone flow (no impact on hotel booking) */}
        <Route path="/registration/ayurveda" element={<PrivateRoute><AyurvedaRegistration /></PrivateRoute>} />
        <Route path="/registration/ayurveda/centre/:centreId" element={<PrivateRoute><AyurvedaCentreManage /></PrivateRoute>} />
        <Route path="/new-booking/ayurveda" element={<PrivateRoute><AyurvedaSearch /></PrivateRoute>} />
        <Route path="/booking-details/ayurveda-booking-list" element={<PrivateRoute><AyurvedaBookingList /></PrivateRoute>} />

         {/* Agent Incentive Module */}
        <Route path="/incentive/config" element={<PrivateRoute><IncentiveConfig /></PrivateRoute>} />
        <Route path="/incentive/my-incentives" element={<PrivateRoute><AgentIncentiveDashboard /></PrivateRoute>} />
        <Route path="/incentive/claims" element={<PrivateRoute><IncentiveClaims /></PrivateRoute>} />


        {/* Hotel Actions */}
        <Route path="/hotel-details/:id" element={<PrivateRoute><HotelRegistrationActions /></PrivateRoute>} />
        {/* compulsory events */}
        <Route path="/registration/hotel/:id/compulsory-events" element={<PrivateRoute><CompulsoryEventsPage /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/occupancy-and-minimumlength" element={<PrivateRoute><OccupancyAndMinimumLength /></PrivateRoute>} />
        {/* hotelavailability */}
        <Route path="/hotel-actions/:id/hotel-availability" element={<PrivateRoute><HotelAvailability /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/validity-period-details" element={<PrivateRoute><ValidityPage /></PrivateRoute>} />
        {/* selected hotelsearch from booking page */}
        <Route path="/hotel-actions/:id/individual-hotel-search" element={<PrivateRoute><IndividualHotelSearch /></PrivateRoute>} />
        {/* contract rate */}
        <Route path="/hotel-actions/:id/contract-rate" element={<PrivateRoute><ContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/contract-rate/create" element={<PrivateRoute><CreateContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/contract-rate/:contractRateId/edit" element={<PrivateRoute><EditContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/contract-rate/:contractRateId/view" element={<PrivateRoute><ViewContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/contract-rate/:editId/copy" element={<PrivateRoute><CopyContractRate /></PrivateRoute>} />
        {/* last-minute contract rate (Phase 1) — separate from normal contract rate */}
        <Route path="/hotel-actions/:id/last-minute-contract-rate" element={<PrivateRoute><LastMinuteContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/last-minute-contract-rate/create" element={<PrivateRoute><LastMinuteContractRateForm mode="create" /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/last-minute-contract-rate/:rateId/edit" element={<PrivateRoute><LastMinuteContractRateForm mode="edit" /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/last-minute-contract-rate/:rateId/view" element={<PrivateRoute><ViewLastMinuteContractRate /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/long-stay-contract" element={<PrivateRoute><LongStayContract /></PrivateRoute>} />
        {/* Meet & Space — manage meeting / event spaces for a hotel (new feature) */}
        <Route path="/hotel-actions/:id/meeting-space" element={<PrivateRoute><MeetingSpaceManage /></PrivateRoute>} />
        {/* Meet & Space — new booking flow (search → book → list/view/cancel) */}
        <Route path="/new-booking/meet-and-space" element={<PrivateRoute><MeetAndSpaceSearch /></PrivateRoute>} />
        <Route path="/new-booking/meet-and-space/book" element={<PrivateRoute><MeetAndSpaceBookingPage /></PrivateRoute>} />
        <Route path="/booking-details/meet-and-space-booking-list" element={<PrivateRoute><MeetAndSpaceBookingList /></PrivateRoute>} />
        <Route path="/booking-details/meet-and-space-booking/:id" element={<PrivateRoute><MeetAndSpaceBookingDetailView /></PrivateRoute>} />
        <Route path="/booking-details/meet-and-space-booking-list/:id/edit" element={<PrivateRoute><MeetAndSpaceBookingEditPage /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/long-stay-contract/create" element={<PrivateRoute><CreateLongStayContract /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/long-stay-contract/:contractId/edit" element={<PrivateRoute><EditLongStayContract /></PrivateRoute>} />
        {/* 24 Hour Check-In configuration pages — list / create / edit. */}
        <Route path="/hotel-actions/:id/24-hour-checkin" element={<PrivateRoute><Hotel24HourCheckin /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/24-hour-checkin/create" element={<PrivateRoute><Hotel24HourCheckinForm mode="create" /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/24-hour-checkin/:configId/edit" element={<PrivateRoute><Hotel24HourCheckinForm mode="edit" /></PrivateRoute>} />

        {/* Day Stay — contract + booking flow */}
        <Route path="/hotel-actions/:id/day-stay-contract" element={<PrivateRoute><DayStayContract /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/day-stay-contract/create" element={<PrivateRoute><DayStayContractForm mode="create" /></PrivateRoute>} />
        <Route path="/hotel-actions/hotel/:id/day-stay-contract/:contractId/edit" element={<PrivateRoute><DayStayContractForm mode="edit" /></PrivateRoute>} />
        <Route path="/new-booking/day-stay" element={<PrivateRoute><DayStaySearch /></PrivateRoute>} />
        <Route path="/day-stay-room-list" element={<PrivateRoute><DayStayRoomList /></PrivateRoute>} />
        <Route path="/day-stay-booking-page" element={<PrivateRoute><DayStayBookingPage /></PrivateRoute>} />
        <Route path="/booking-details/day-stay-booking-list" element={<PrivateRoute><DayStayBookingList /></PrivateRoute>} />
        <Route path="/booking-details/day-stay-booking/:id" element={<PrivateRoute><DayStayBookingDetailView /></PrivateRoute>} />

        {/* promotion */}
        {/* Sidebar "Promotion" entry — hotel search filtered to only
            hotels with active in-validity promotions. */}
        <Route path="/promotion" element={<PrivateRoute><PromotionHotelSearch /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotions" element={<PrivateRoute><Promotion /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/special-rate/save" element={<PrivateRoute><SpecialRates /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/special-rate/edit/:editId" element={<PrivateRoute><EditSpecialRates /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/staypay/save" element={<PrivateRoute><StayPayPromotion /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/staypay/edit/:editId" element={<PrivateRoute><EditStayPayPromotion /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/discount/save" element={<PrivateRoute><DiscountPromotion /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/promotion/discount/edit/:editId" element={<PrivateRoute><EditDiscountPromotion /></PrivateRoute>} />
        {/* policy */}
        <Route path="/hotel-actions/:id/hotel-policy" element={<PrivateRoute><Policy /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/hotel-policy/create" element={<PrivateRoute><PolicyCreate /></PrivateRoute>} />
        <Route path="/hotel-actions/:id/hotel-policy/:editId/edit" element={<PrivateRoute><PolicyUpdate /></PrivateRoute>} />
      
        {/* inhouse accounts */}
        <Route path="/inhouse-accounts/agent" element={<PrivateRoute><AgentAccounts /></PrivateRoute>} />
        <Route path="/inhouse-accounts/agent-payment-history/:id" element={<PrivateRoute><AgentsPaymentHistory /></PrivateRoute>} />
        <Route path="/inhouse-accounts/agent-auto-generated-invoice/:id" element={<PrivateRoute><AgentsAutoGeneratedInvoice /></PrivateRoute>} />

        {/* sidebarMenus */}
        <Route path="/calendar" element={<PrivateRoute><Calendar /></PrivateRoute>} />
        <Route path="/invoice" element={<PrivateRoute><Invoice /></PrivateRoute>} />
        <Route path="/offer" element={<PrivateRoute><OfferZone /></PrivateRoute>} />
        <Route path="/upload-offer-image" element={<PrivateRoute><OfferImageUpload /></PrivateRoute>} />
        <Route path="/advertisements" element={<PrivateRoute><Advertisements /></PrivateRoute>} />
        <Route path="/marketing/promotion-flyer" element={<PrivateRoute><PromotionFlyer /></PrivateRoute>} />
        <Route path="/advertisements/view/:id" element={<PrivateRoute><AdvertisementDetailedView /></PrivateRoute>} />

        {/* Extranet login — REUSE the admin hotel-actions components so the
            extranet pages mirror the admin pages exactly (same UI + logic).
            Each component detects the "/extranet" path via useLocation and
            adjusts only its Back button (→ /extranetDashboard) and its
            create/edit/view links (→ /extranet/*). The admin "/hotel-actions/*"
            routes and behavior are unchanged. Routes mirror the hotel-actions
            URL shape with an "/extranet" prefix so the swap is 1:1. */}
        <Route path="/extranet/calendar" element={<PrivateRoute><ExtranetCalendar /></PrivateRoute>} />
        <Route path="/extranet/:id/gallery" element={<PrivateRoute><ExtranetImgUpload /></PrivateRoute>} />

        {/* Extranet-scoped hotel details hub + profile edit — same components
            as the admin /hotel-details/:id and /registration/hotel/create/:id,
            but under an /extranet URL so a logged-in hotel stays in its own
            namespace. The components detect the /extranet path and keep their
            internal links extranet-scoped. */}
        <Route path="/extranet/hotel-details/:id" element={<PrivateRoute><HotelRegistrationActions /></PrivateRoute>} />
        <Route path="/extranet/registration/hotel/create/:id" element={<PrivateRoute><HotelReg /></PrivateRoute>} />

        <Route path="/extranet/:id/occupancy-and-minimumlength" element={<PrivateRoute><OccupancyAndMinimumLength /></PrivateRoute>} />

        <Route path="/extranet/:id/contract-rate" element={<PrivateRoute><ContractRate /></PrivateRoute>} />
        <Route path="/extranet/hotel/:id/contract-rate/create" element={<PrivateRoute><CreateContractRate /></PrivateRoute>} />
        <Route path="/extranet/hotel/:id/contract-rate/:contractRateId/edit" element={<PrivateRoute><EditContractRate /></PrivateRoute>} />
        <Route path="/extranet/hotel/:id/contract-rate/:contractRateId/view" element={<PrivateRoute><ViewContractRate /></PrivateRoute>} />
        <Route path="/extranet/hotel/:id/contract-rate/:editId/copy" element={<PrivateRoute><CopyContractRate /></PrivateRoute>} />

        <Route path="/extranet/:id/promotions" element={<PrivateRoute><Promotion /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/special-rate/save" element={<PrivateRoute><SpecialRates /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/special-rate/edit/:editId" element={<PrivateRoute><EditSpecialRates /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/staypay/save" element={<PrivateRoute><StayPayPromotion /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/staypay/edit/:editId" element={<PrivateRoute><EditStayPayPromotion /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/discount/save" element={<PrivateRoute><DiscountPromotion /></PrivateRoute>} />
        <Route path="/extranet/:id/promotion/discount/edit/:editId" element={<PrivateRoute><EditDiscountPromotion /></PrivateRoute>} />

        <Route path="/extranet/:id/hotel-policy" element={<PrivateRoute><Policy /></PrivateRoute>} />
        <Route path="/extranet/:id/hotel-policy/create" element={<PrivateRoute><PolicyCreate /></PrivateRoute>} />
        <Route path="/extranet/:id/hotel-policy/:editId/edit" element={<PrivateRoute><PolicyUpdate /></PrivateRoute>} />

        <Route path="/extranet/:id/hotel-availability" element={<PrivateRoute><HotelAvailability /></PrivateRoute>} />

       

      </Routes>

      {/* AI booking copilot — self-hides outside booking-related routes */}
      {/* <CopilotWidget /> */}

      {/* Toast container */}
      <Toaster
        // position="top-center"
        containerStyle={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        toastOptions={{
          duration: 1000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: "#4bb543",
              secondary: "#fff",
            },
          },
          error: {
            duration: 3000,
            iconTheme: {
              primary: "#ff3333",
              secondary: "#fff",
            },
          },
        }}
      />
    </div>
  );
}
