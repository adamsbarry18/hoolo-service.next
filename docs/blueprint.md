# **App Name**: HooloBiz Manager

## Core Features:

- Secure User Authentication & Role Management: User registration and login using Firebase Authentication. Admin users have full system access, while Vendeurs are restricted to their specific boutique with limited permissions, enforced by Firebase Security Rules.
- Product & Multi-Store Inventory Management: Add, edit, and categorize products. Track current stock levels for each boutique and central warehouse. Automatically adjust stock upon sales or purchases and trigger alerts for low inventory thresholds.
- Sales (Cash & Credit) & Payment Processing: Process cash and credit sales transactions, supporting multiple payment methods (cash, mobile money). Generate sales receipts and automatically update customer debts for credit sales. Inventory is deducted automatically upon sale.
- Customer Relationship Management & Credit Tracking: Maintain detailed customer profiles, including contact information and purchase history. Track outstanding credit, manage credit limits, record repayments, and generate alerts for overdue payments.
- Repair Order Management: Create and manage repair orders with fields for customer details, device information, issue description, and status updates (received, in progress, completed). Allows adding parts from inventory and calculates total cost.
- Centralized Dashboard & Reporting: Provides real-time dashboards with key performance indicators like sales revenue, stock value, and outstanding credit. Admins can view aggregated data across all boutiques, while Vendeurs see their specific store's performance.
- AI-Powered Part Recommendation Tool: During repair order creation, an AI tool suggests compatible or frequently used spare parts based on the selected device model, reported issue, or historical repair data, improving efficiency and accuracy.

## Style Guidelines:

- A sophisticated light scheme with a deep, reliable blue (#1F58B3) as the primary action color, signifying professionalism and clarity. The background will be a calm, almost neutral light blue-gray (#ECF1F7) for visual spaciousness and readability. An accent color of rich lavender (#9333ED) will highlight key interactive elements and alerts.
- The font 'Inter' (sans-serif) will be used throughout the application for both headlines and body text. Its modern, clean, and highly legible design ensures optimal readability and a consistent, professional appearance across all screen sizes.
- Utilize clear, minimalist line icons, akin to those found in Material Icons or Heroicons. Icons will be strategically used to enhance navigation, highlight actions, and visually represent data without cluttering the interface.
- A mobile-first responsive design featuring a persistent sidebar navigation for main modules, and content areas that adapt smoothly to different screen sizes. Dashboards will prioritize clarity with well-organized data and interactive elements. Emphasis on intuitive flow and rapid access to core functions.
- Subtle, fast, and functional animations will be employed for state changes, navigation transitions, and data updates. These animations will aim to improve perceived performance and user experience without introducing delays or distractions.