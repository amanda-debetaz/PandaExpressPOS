import java.sql.*;
import java.awt.*;
import java.awt.event.*;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableCellRenderer;
import javax.swing.table.AbstractTableModel;
import java.util.ArrayList;
import java.util.List;
import java.util.HashMap;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * A GUI application for a cashier system that interacts with a PostgreSQL database
 * to manage menu items and calculate order totals.
 * 
 * @author George Dai, Help from Team 31
 */
public class GUI extends JFrame implements ActionListener {
    static JFrame f;
    static Connection conn;
    // Tracks the currently authenticated employee for the session
    private static Integer loggedInEmployeeId = null;
    private static String loggedInEmployeeName = null;
    private double total = 0.0;
    private DefaultTableModel orderTableModel;
    private ArrayList<OrderItem> orderItems;
    private JLabel totalLabel; // Store reference for ButtonEditor
    private JTable orderTable; // Store reference for ButtonEditor

    /**
     * Represents an item in the order with name, price, and quantity.
     */
    private static class OrderItem {
        String name;
        double price;
        int quantity;

        OrderItem(String name, double price) {
            this.name = name;
            this.price = price;
            this.quantity = 1;
        }
    }

    /**
     * Constructor for the GUI class. Initializes the total order amount and order items list.
     */
    public GUI() {
        this.total = 0.0;
        this.orderItems = new ArrayList<>();
    }

    // to stabilize wsl connection
    static {
        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("PostgreSQL driver not on classpath", e);
        }
    }

    /**
     * Main method to initialize the database connection and create the GUI.
     * 
     * @param args Command-line arguments (not used).
     */
    public static void main(String[] args) {
        // Building the connection
        conn = null;
        String database_name = "team_31_db";
        String database_user = "team_31";
        String database_password = "panda_31";
        String database_url = String.format("jdbc:postgresql://csce-315-db.engr.tamu.edu/%s", database_name);
        try {
            conn = DriverManager.getConnection(database_url, database_user, database_password);
            // Create clock_log table if it doesn't exist
            String createTableSQL = "CREATE TABLE IF NOT EXISTS clock_log (" +
                                   "log_id SERIAL PRIMARY KEY, " +
                                   "employee_id INTEGER REFERENCES employee(employee_id), " +
                                   "clock_in TIMESTAMP, " +
                                   "clock_out TIMESTAMP, " +
                                   "status VARCHAR(10) CHECK (status IN ('IN', 'OUT')))";
            try (Statement stmt = conn.createStatement()) {
                stmt.executeUpdate(createTableSQL);
            }
        } catch (Exception e) {
            e.printStackTrace();
            System.err.println(e.getClass().getName() + ": " + e.getMessage());
            System.exit(0);
        }
        JOptionPane.showMessageDialog(null, "Opened database successfully");

        // create a new frame
        f = new JFrame("Cashier GUI");

        // create a GUI object
        GUI s = new GUI();

        // Block the UI until a valid employee logs in
        boolean authenticated = s.requireEmployeeLogin(f);
        if (!authenticated) {
            JOptionPane.showMessageDialog(null, "Application will close (login required)");
            try { if (conn != null) conn.close(); } catch (Exception ignore) {}
            System.exit(0);
        }

        // create a panel
        JPanel p = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(10, 10, 10, 10);
        gbc.fill = GridBagConstraints.BOTH;

        // Total label
        s.totalLabel = new JLabel("Total: $" + String.format("%.2f", s.total));
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.gridwidth = 3;
        p.add(s.totalLabel, gbc);

        // Order table
        String[] columnNames = {"Item", "Quantity", "Price", "Delete"};
        s.orderTableModel = new DefaultTableModel(columnNames, 0);
        s.orderTable = new JTable(s.orderTableModel);
        s.orderTable.getColumn("Delete").setCellRenderer(new ButtonRenderer());
        s.orderTable.getColumn("Delete").setCellEditor(new ButtonEditor(new JCheckBox(), s));
        JScrollPane tableScrollPane = new JScrollPane(s.orderTable);
        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 3;
        gbc.gridheight = 2;
        gbc.weightx = 1.0;
        gbc.weighty = 1.0;
        p.add(tableScrollPane, gbc);

        gbc.gridheight = 1;

        // Meal size panel with title
        JPanel mealSizeOuter = new JPanel(new BorderLayout());
        mealSizeOuter.add(new JLabel("meal size"), BorderLayout.NORTH);
        JPanel mealSizeInner = new JPanel(new GridLayout(4, 1));
        mealSizeInner.add(s.createButton("Bowl", "menu_item", "Bowl", s.totalLabel));
        mealSizeInner.add(s.createButton("Plate", "menu_item", "Plate", s.totalLabel));
        mealSizeInner.add(s.createButton("Big Plate", "menu_item", "Bigger Plate", s.totalLabel));
        mealSizeOuter.add(mealSizeInner, BorderLayout.CENTER);
        gbc.gridx = 0;
        gbc.gridy = 3;
        gbc.gridwidth = 1;
        gbc.weightx = 0.0;
        gbc.weighty = 0.0;
        p.add(mealSizeOuter, gbc);

        // Clock in/out button
        JButton clockButton = new JButton("Clock In/Out");
        clockButton.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                s.showClockInOutDialog();
            }
        });
        gbc.gridx = 2;
        gbc.gridy = 0;
        gbc.gridheight = 2;
        p.add(clockButton, gbc);

        gbc.gridheight = 1;

        // Bases panel with title
        JPanel basesOuter = new JPanel(new BorderLayout());
        basesOuter.add(new JLabel("Bases"), BorderLayout.NORTH);
        JPanel basesInner = new JPanel(new GridLayout(4, 1));
        basesInner.add(s.createButton("Rice", "menu_item", "White Steamed Rice", s.totalLabel));
        basesInner.add(s.createButton("Chow Mein", "menu_item", "Chow Mein", s.totalLabel));
        basesInner.add(s.createButton("Fried Rice", "menu_item", "Fried Rice", s.totalLabel));
        basesInner.add(s.createButton("Super Greens", "menu_item", "Super Greens", s.totalLabel));
        basesOuter.add(basesInner, BorderLayout.CENTER);
        gbc.gridx = 0;
        gbc.gridy = 4;
        p.add(basesOuter, gbc);

        // Entree panel with title
        JPanel entreeOuter = new JPanel(new BorderLayout());
        entreeOuter.add(new JLabel("Entree"), BorderLayout.NORTH);
        JPanel entreeInner = new JPanel(new GridLayout(6, 2));
        // Dynamically fetch entrees from menu_item table with category_id = 3
        try (Statement stmt = conn.createStatement()) {
            String sql = "SELECT name FROM menu_item WHERE category_id = 3 AND is_active = TRUE ORDER BY name";
            ResultSet rs = stmt.executeQuery(sql);
            while (rs.next()) {
                String itemName = rs.getString("name");
                entreeInner.add(s.createButton(itemName, "menu_item", itemName, s.totalLabel));
            }
            rs.close();
        } catch (SQLException ex) {
            JOptionPane.showMessageDialog(null, "Error fetching entrees: " + ex.getMessage());
        }
        entreeOuter.add(entreeInner, BorderLayout.CENTER);
        gbc.gridx = 1;
        gbc.gridy = 4;
        gbc.gridwidth = 2;
        p.add(entreeOuter, gbc);

        gbc.gridwidth = 1;

        // Appetizer panel with title
        JPanel appetizerOuter = new JPanel(new BorderLayout());
        appetizerOuter.add(new JLabel("Appetizer"), BorderLayout.NORTH);
        JPanel appetizerInner = new JPanel(new GridLayout(3, 2));
        appetizerInner.add(s.createButton("Vegg Roll", "menu_item", "Veggie Spring Roll", s.totalLabel));
        appetizerInner.add(s.createButton("Chicken Roll", "menu_item", "Chicken Egg Roll", s.totalLabel));
        appetizerInner.add(s.createButton("Rangoon", "menu_item", "Cream Cheese Rangoon", s.totalLabel));
        appetizerOuter.add(appetizerInner, BorderLayout.CENTER);
        gbc.gridx = 0;
        gbc.gridy = 5;
        p.add(appetizerOuter, gbc);

        // Cancel Order button
        JButton cancelButton = new JButton("X cancel order");
        cancelButton.addActionListener(new ActionListener() {
            public void actionPerformed(ActionEvent e) {
                s.total = 0.0;
                s.orderItems.clear();
                s.orderTableModel.setRowCount(0);
                s.totalLabel.setText("Total: $" + String.format("%.2f", s.total));
            }
        });
        gbc.gridx = 0;
        gbc.gridy = 6;
        gbc.gridwidth = 1;
        p.add(cancelButton, gbc);

        // Pay button
        JButton payButton = new JButton("Pay");
        payButton.addActionListener(new ActionListener() {
            public void actionPerformed(ActionEvent e) {
                try {
                    conn.setAutoCommit(false);
                    // Map to track ingredient usage (ingredient_id -> {name, total quantity})
                    HashMap<Integer, IngredientUsage> ingredientUsage = new HashMap<>();
                    for (OrderItem oi : s.orderItems) {
                        int qty = oi.quantity;
                        String name = oi.name;
                        List<String> components = new ArrayList<>();
                        if (name.startsWith("Bowl (") || name.startsWith("Plate (") || name.startsWith("Bigger Plate (")) {
                            int start = name.indexOf("(") + 1;
                            int end = name.lastIndexOf(")");
                            String inside = name.substring(start, end);
                            String[] parts = inside.split(", ");
                            for (String part : parts) {
                                components.add(part);
                            }
                        } else {
                            components.add(name);
                        }
                        for (String comp : components) {
                            Integer menuId = s.getMenuItemId(comp);
                            if (menuId != null) {
                                s.subtractRecipe(menuId, qty, ingredientUsage);
                            }
                        }
                    }
                    conn.commit();
                    // Build the inventory change message
                    StringBuilder usageMessage = new StringBuilder("Inventory items used:\n");
                    for (IngredientUsage usage : ingredientUsage.values()) {
                        usageMessage.append(String.format("- %s: %.2f %s\n", usage.name, usage.quantity, usage.unit));
                    }
                    usageMessage.append(String.format("\nTotal Paid: $%.2f", s.total));
                    JOptionPane.showMessageDialog(null, usageMessage.toString());
                    s.total = 0.0;
                    s.orderItems.clear();
                    s.orderTableModel.setRowCount(0);
                    s.totalLabel.setText("Total: $" + String.format("%.2f", s.total));
                } catch (SQLException ex) {
                    try {
                        conn.rollback();
                    } catch (SQLException rollbackEx) {
                        rollbackEx.printStackTrace();
                    }
                    JOptionPane.showMessageDialog(null, "Error updating inventory: " + ex.getMessage());
                } finally {
                    try {
                        conn.setAutoCommit(true);
                    } catch (SQLException autoCommitEx) {
                        autoCommitEx.printStackTrace();
                    }
                }
            }
        });
        gbc.gridx = 2;
        gbc.gridy = 6;
        gbc.gridwidth = 1;
        p.add(payButton, gbc);

        // Manager button
        gbc.gridx = 1;
        gbc.gridy = 6;
        JButton managerButton = new JButton("Manager");
        managerButton.addActionListener(new ActionListener() {
            @Override public void actionPerformed(ActionEvent e) {
                s.showManagerLogin();
            }
        });
        p.add(managerButton, gbc);

        // Close button
        JButton closeButton = new JButton("Close");
        closeButton.addActionListener(s);
        gbc.gridx = 0;
        gbc.gridy = 7;
        gbc.gridwidth = 3;
        p.add(closeButton, gbc);

        // add panel to frame
        f.add(p);

        // set the size of frame
        f.setSize(1000, 800);
        f.setVisible(true);
    }

    /**
     * Class to store ingredient usage information
     */
    private static class IngredientUsage {
        String name;
        double quantity;
        String unit;

        IngredientUsage(String name, double quantity, String unit) {
            this.name = name;
            this.quantity = quantity;
            this.unit = unit;
        }
    }

    /**
     * Shows a blocking login dialog that requires a valid employee ID and password.
     * The method loops until correct credentials are provided or the user cancels.
     * On success, it stores the authenticated employee into static fields.
     *
     * @param owner the window to center the dialog over
     * @return true if login succeeds; false if user cancels
     */
    private boolean requireEmployeeLogin(Window owner) {
        JTextField idField = new JTextField();
        JPasswordField pwField = new JPasswordField();
        pwField.setEchoChar('•');

        while (true) {
            JPanel form = new JPanel(new GridLayout(0, 1, 4, 4));
            form.add(new JLabel("Employee ID:"));
            form.add(idField);
            form.add(new JLabel("Password:"));
            form.add(pwField);

            int choice = JOptionPane.showConfirmDialog(owner instanceof Component ? (Component) owner : null,
                    form, "Employee Login", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (choice != JOptionPane.OK_OPTION) {
                return false; // user cancelled
            }

            String idText = idField.getText().trim();
            char[] pw = pwField.getPassword();
            String pwText = new String(pw);
            java.util.Arrays.fill(pw, '\0');

            Integer eid = null;
            try {
                eid = Integer.parseInt(idText);
            } catch (NumberFormatException ex) {
                JOptionPane.showMessageDialog(this, "Employee ID must be a number.", "Invalid Input", JOptionPane.ERROR_MESSAGE);
                pwField.setText("");
                continue;
            }

            if (verifyEmployeeIdAndPassword(eid, pwText)) {
                loggedInEmployeeId = eid;
                loggedInEmployeeName = fetchEmployeeName(eid);
                pwField.setText("");
                return true;
            } else {
                JOptionPane.showMessageDialog(this, "Incorrect ID or password, or inactive account.",
                        "Access denied", JOptionPane.ERROR_MESSAGE);
                pwField.setText("");
            }
        }
    }

    /**
     * Verifies employee credentials using employee_id and password.
     */
    private boolean verifyEmployeeIdAndPassword(int employeeId, String password) {
        final String sql = "SELECT is_active FROM employee WHERE employee_id = ? AND password_hash = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, employeeId);
            ps.setString(2, password);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getBoolean("is_active");
                }
            }
        } catch (SQLException ex) {
            JOptionPane.showMessageDialog(this, "Login failed: " + ex.getMessage(), "DB error", JOptionPane.ERROR_MESSAGE);
        }
        return false;
    }

    /**
     * Returns the employee name for the given id, or null if not found.
     */
    private String fetchEmployeeName(int employeeId) {
        final String sql = "SELECT name FROM employee WHERE employee_id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, employeeId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getString("name");
            }
        } catch (SQLException ignored) {}
        return null;
    }

    /**
     * Creates a button that retrieves the price of a menu item from the database
     * and updates the total and order table when clicked.
     * 
     * @param buttonName The text to display on the button.
     * @param tableName The database table containing the menu item.
     * @param itemName The name of the menu item in the database.
     * @param totalLabel The label to update with the running total.
     * @return The created JButton with the specified action.
     */
    private JButton createButton(String buttonName, String tableName, String itemName, JLabel totalLabel) {
        JButton button = new JButton(buttonName);
        button.addActionListener(new ActionListener() {
            public void actionPerformed(ActionEvent e) {
                try {
                    Statement stmt = conn.createStatement();
                    String sql = "SELECT price FROM " + tableName + " WHERE name = '" + itemName + "'";
                    ResultSet result = stmt.executeQuery(sql);
                    if (result.next()) {
                        double price = result.getDouble("price");
                        boolean isMeal = itemName.equals("Bowl") || itemName.equals("Plate") || itemName.equals("Bigger Plate");
                        if (isMeal) {
                            // Determine number of entrees based on meal type
                            int numEntrees = itemName.equals("Bowl") ? 1 : itemName.equals("Plate") ? 2 : 3;

                            // Select base
                            String[] baseOptions = {"White Steamed Rice", "Chow Mein", "Fried Rice", "Super Greens"};
                            String base = (String) JOptionPane.showInputDialog(f, "Select base for " + itemName, "Select Base", JOptionPane.QUESTION_MESSAGE, null, baseOptions, baseOptions[0]);
                            if (base == null) {
                                result.close();
                                stmt.close();
                                return; // Cancel addition
                            }

                            // Fetch entrees
                            ArrayList<String> entreeOptions = new ArrayList<>();
                            Statement stmt2 = conn.createStatement();
                            String sql2 = "SELECT name FROM menu_item WHERE category_id = 3 AND is_active = TRUE ORDER BY name";
                            ResultSet rs2 = stmt2.executeQuery(sql2);
                            while (rs2.next()) {
                                entreeOptions.add(rs2.getString("name"));
                            }
                            rs2.close();
                            stmt2.close();

                            String[] entreeArr = entreeOptions.toArray(new String[0]);

                            // Select entrees
                            ArrayList<String> selectedEntrees = new ArrayList<>();
                            for (int i = 0; i < numEntrees; i++) {
                                String entree = (String) JOptionPane.showInputDialog(f, "Select entree " + (i + 1) + " of " + numEntrees + " for " + itemName, "Select Entree", JOptionPane.QUESTION_MESSAGE, null, entreeArr, entreeArr[0]);
                                if (entree == null) {
                                    result.close();
                                    stmt.close();
                                    return; // Cancel addition
                                }
                                selectedEntrees.add(entree);
                            }

                            // Build display name with associated base and entrees
                            StringBuilder sb = new StringBuilder(itemName);
                            sb.append(" (");
                            sb.append(base);
                            for (String ent : selectedEntrees) {
                                sb.append(", ").append(ent);
                            }
                            sb.append(")");
                            String fullName = sb.toString();

                            // Update total
                            total += price;
                            totalLabel.setText("Total: $" + String.format("%.2f", total));

                            // Update order items list
                            boolean itemExists = false;
                            for (OrderItem item : orderItems) {
                                if (item.name.equals(fullName)) {
                                    item.quantity++;
                                    itemExists = true;
                                    break;
                                }
                            }
                            if (!itemExists) {
                                orderItems.add(new OrderItem(fullName, price));
                            }

                            // Update table
                            updateOrderTable();
                        } else {
                            total += price;
                            totalLabel.setText("Total: $" + String.format("%.2f", total));

                            // Update order items list
                            boolean itemExists = false;
                            for (OrderItem item : orderItems) {
                                if (item.name.equals(itemName)) {
                                    item.quantity++;
                                    itemExists = true;
                                    break;
                                }
                            }
                            if (!itemExists) {
                                orderItems.add(new OrderItem(itemName, price));
                            }

                            // Update table
                            updateOrderTable();
                        }
                    } else {
                        totalLabel.setText("Total: $" + String.format("%.2f", total));
                    }
                    result.close();
                    stmt.close();
                } catch (SQLException ex) {
                    JOptionPane.showMessageDialog(null, "Error fetching price: " + ex.toString());
                }
            }
        });
        return button;
    }

    /**
     * Updates the order table with the current order items.
     */
    private void updateOrderTable() {
        orderTableModel.setRowCount(0);
        for (OrderItem item : orderItems) {
            orderTableModel.addRow(new Object[]{
                item.name,
                item.quantity,
                String.format("%.2f", item.price * item.quantity),
                "Delete"
            });
        }
    }

    /**
     * Removes an item from the order and updates the total and table.
     * 
     * @param itemName The name of the item to remove.
     */
    private void removeItem(String itemName) {
        for (int i = 0; i < orderItems.size(); i++) {
            OrderItem item = orderItems.get(i);
            if (item.name.equals(itemName)) {
                total -= item.price;
                if (item.quantity > 1) {
                    item.quantity--;
                } else {
                    orderItems.remove(i);
                }
                break;
            }
        }
        updateOrderTable();
    }

    private Integer getMenuItemId(String name) {
        try (PreparedStatement ps = conn.prepareStatement("SELECT menu_item_id FROM menu_item WHERE name = ?")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return null;
    }

    private void subtractRecipe(int menuId, int qty, HashMap<Integer, IngredientUsage> ingredientUsage) throws SQLException {
        String sql = "SELECT r.ingredient_id, r.qty_per_item, i.name, i.unit " +
                     "FROM recipe r JOIN inventory i ON r.ingredient_id = i.ingredient_id " +
                     "WHERE r.menu_item_id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, menuId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int ingId = rs.getInt("ingredient_id");
                    double qtyPer = rs.getDouble("qty_per_item");
                    String ingName = rs.getString("name");
                    String unit = rs.getString("unit");
                    double subtract = qtyPer * qty;
                    updateInventory(ingId, -subtract);
                    // Update ingredient usage map
                    ingredientUsage.compute(ingId, (key, usage) -> {
                        if (usage == null) {
                            return new IngredientUsage(ingName, subtract, unit);
                        } else {
                            usage.quantity += subtract;
                            return usage;
                        }
                    });
                }
            }
        }
    }

    private void updateInventory(int ingId, double delta) throws SQLException {
        String sql = "UPDATE inventory SET current_quantity = current_quantity + ? WHERE ingredient_id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setDouble(1, delta);
            ps.setInt(2, ingId);
            ps.executeUpdate();
        }
    }

    /**
     * Handles the action for the Close button, closing the database connection
     * and disposing of the frame.
     * 
     * @param e The ActionEvent triggered by the button.
     */
    public void actionPerformed(ActionEvent e) {
        String s = e.getActionCommand();
        if (s.equals("Close")) {
            try {
                conn.close();
                JOptionPane.showMessageDialog(null, "Connection Closed.");
            } catch (SQLException ex) {
                JOptionPane.showMessageDialog(null, "Connection NOT Closed.");
            }
            f.dispose();
        }
    }

    /**
     * Displays a dialog for clock-in/out, prompting for name and password.
     * Verifies credentials and logs the clock event.
     */
    private void showClockInOutDialog() {
        JTextField nameField = new JTextField();
        JPasswordField passwordField = new JPasswordField();
        passwordField.setEchoChar('•');

        JPanel panel = new JPanel(new GridLayout(0, 1, 4, 4));
        panel.add(new JLabel("Employee Name:"));
        panel.add(nameField);
        panel.add(new JLabel("Password:"));
        panel.add(passwordField);

        int choice = JOptionPane.showConfirmDialog(
            this, panel, "Clock In/Out",
            JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE
        );
        if (choice != JOptionPane.OK_OPTION) return;

        String name = nameField.getText().trim();
        char[] password = passwordField.getPassword();
        String passwordStr = new String(password);
        java.util.Arrays.fill(password, '\0');

        if (verifyEmployeeCredentials(name, passwordStr)) {
            processClockEvent(name);
        } else {
            JOptionPane.showMessageDialog(this, "Invalid name or password.", "Access Denied", JOptionPane.ERROR_MESSAGE);
        }
    }

    /**
     * Verifies employee credentials against the employee table.
     * 
     * @param name The employee's name.
     * @param password The password to verify.
     * @return true if credentials are valid and employee is active, false otherwise.
     */
    private boolean verifyEmployeeCredentials(String name, String password) {
        String sql = "SELECT employee_id, is_active FROM employee WHERE name = ? AND password_hash = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, name);
            ps.setString(2, password);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getBoolean("is_active");
                }
            }
        } catch (SQLException ex) {
            JOptionPane.showMessageDialog(this, "Error verifying credentials: " + ex.getMessage(), "DB Error", JOptionPane.ERROR_MESSAGE);
        }
        return false;
    }

    /**
     * Processes clock-in or clock-out event, logging to clock_log table.
     * 
     * @param name The employee's name.
     */
    private void processClockEvent(String name) {
        try {
            // Get employee_id
            int employeeId = -1;
            String sqlGetId = "SELECT employee_id FROM employee WHERE name = ?";
            try (PreparedStatement ps = conn.prepareStatement(sqlGetId)) {
                ps.setString(1, name);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        employeeId = rs.getInt("employee_id");
                    } else {
                        throw new SQLException("Employee not found.");
                    }
                }
            }

            // Check last clock event
            String sqlLastEvent = "SELECT status, log_id FROM clock_log WHERE employee_id = ? ORDER BY clock_in DESC LIMIT 1";
            String status = "IN";
            int logId = -1;
            try (PreparedStatement ps = conn.prepareStatement(sqlLastEvent)) {
                ps.setInt(1, employeeId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        String lastStatus = rs.getString("status");
                        logId = rs.getInt("log_id");
                        if (lastStatus.equals("IN")) {
                            status = "OUT";
                        }
                    }
                }
            }

            LocalDateTime now = LocalDateTime.now();
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("HH:mm");
            String timeStr = now.format(formatter);

            if (status.equals("IN")) {
                String sqlInsert = "INSERT INTO clock_log (employee_id, clock_in, status) VALUES (?, ?, ?)";
                try (PreparedStatement ps = conn.prepareStatement(sqlInsert)) {
                    ps.setInt(1, employeeId);
                    ps.setTimestamp(2, Timestamp.valueOf(now));
                    ps.setString(3, "IN");
                    ps.executeUpdate();
                }
                JOptionPane.showMessageDialog(this, name + " clocked in at " + timeStr, "Clock In", JOptionPane.INFORMATION_MESSAGE);
            } else {
                String sqlUpdate = "UPDATE clock_log SET clock_out = ?, status = ? WHERE log_id = ?";
                try (PreparedStatement ps = conn.prepareStatement(sqlUpdate)) {
                    ps.setTimestamp(1, Timestamp.valueOf(now));
                    ps.setString(2, "OUT");
                    ps.setInt(3, logId);
                    ps.executeUpdate();
                }
                JOptionPane.showMessageDialog(this, name + " clocked out at " + timeStr, "Clock Out", JOptionPane.INFORMATION_MESSAGE);
            }
        } catch (SQLException ex) {
            JOptionPane.showMessageDialog(this, "Error processing clock event: " + ex.getMessage(), "DB Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    /**
     * Custom renderer for the Delete button column.
     */
    private static class ButtonRenderer extends JButton implements TableCellRenderer {
        public ButtonRenderer() {
            setOpaque(true);
        }

        public Component getTableCellRendererComponent(JTable table, Object value,
                boolean isSelected, boolean hasFocus, int row, int column) {
            setText((value == null) ? "" : value.toString());
            return this;
        }
    }

    /**
     * Custom editor for the Delete button column.
     */
    private static class ButtonEditor extends DefaultCellEditor {
        private String label;
        private JButton button;
        private boolean isPushed;
        private GUI gui;

        public ButtonEditor(JCheckBox checkBox, GUI gui) {
            super(checkBox);
            this.gui = gui;
            button = new JButton();
            button.setOpaque(true);
            button.addActionListener(new ActionListener() {
                public void actionPerformed(ActionEvent e) {
                    fireEditingStopped();
                }
            });
        }

        public Component getTableCellEditorComponent(JTable table, Object value,
                boolean isSelected, int row, int column) {
            label = (value == null) ? "" : value.toString();
            button.setText(label);
            isPushed = true;
            return button;
        }

        public Object getCellEditorValue() {
            if (isPushed) {
                int selectedRow = gui.orderTable.getSelectedRow();
                if (selectedRow >= 0 && selectedRow < gui.orderTableModel.getRowCount()) {
                    String itemName = (String) gui.orderTableModel.getValueAt(selectedRow, 0);
                    gui.removeItem(itemName);
                    gui.totalLabel.setText("Total: $" + String.format("%.2f", gui.total));
                }
            }
            isPushed = false;
            return label;
        }

        public boolean stopCellEditing() {
            isPushed = false;
            return super.stopCellEditing();
        }

        protected void fireEditingStopped() {
            super.fireEditingStopped();
        }
    }

    /**
     * Displays a password prompt for manager access and validates the credential.
     * Loops on incorrect input with an "Access denied" message and clears the field.
     * On success, opens the {@link ManagerWindow} modal dialog.
     */
    private void showManagerLogin() {
        JPasswordField pf = new JPasswordField();
        pf.setEchoChar('•');

        while (true) {
            int choice = JOptionPane.showConfirmDialog(
                this, pf, "Enter manager password",
                JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE
            );
            if (choice != JOptionPane.OK_OPTION) return; // cancel

            char[] pw = pf.getPassword();
            boolean ok = verifyManagerPassword(new String(pw));
            java.util.Arrays.fill(pw, '\0');

            if (ok) {
                new ManagerWindow(this).setVisible(true);
                break;
            } else {
                JOptionPane.showMessageDialog(this, "Incorrect password. Try again.",
                                                "Access denied", JOptionPane.ERROR_MESSAGE);
                pf.setText("");
            }
        }
    }

    /**
     * Verifies the provided manager password against the database.
     * Checks for an active employee with role 'manager' whose password_hash matches the input.
     *
     * @param password the plaintext password to validate.
     * @return {@code true} if an active manager with the given password exists; {@code false} otherwise.
     */
    private boolean verifyManagerPassword(String password) {
        final String sql =
            "SELECT 1 FROM employee " +
            "WHERE role='manager' AND is_active AND password_hash = ? " +
            "LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, password);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (SQLException ex) {
            JOptionPane.showMessageDialog(this, "Login check failed: " + ex.getMessage(),
                                            "DB error", JOptionPane.ERROR_MESSAGE);
            return false;
        }
    }

    /**
     * Manager window
     */
    private static class ManagerWindow extends JDialog {
        /** Reference to the parent GUI frame. */
        private final GUI parent;
        /** Center results table. */
        private JTable table;
        /** Backing model for the results table. */
        private DefaultTableModel model;

        /** card layout + content panel for center area */
        private CardLayout cards;
        private JPanel content;
        /** menu manager panel card */
        private MenuManagerPanel menuPanel;

        /** Displays a title or date range above the results table. */
        private JLabel reportTitleLabel;

        /**
         * Constructs a modal Manager window with a left-side action panel and
         * a center table for query results.
         *
         * @param parent the owning {@link GUI} frame.
         */
        ManagerWindow(GUI parent) {
            super(parent, "Manager", true);
            this.parent = parent;

            setSize(1000, 800);
            setLocationRelativeTo(parent);
            setLayout(new BorderLayout(12, 12));

            JPanel left = new JPanel();
            left.setLayout(new BoxLayout(left, BoxLayout.Y_AXIS));
            left.setBorder(BorderFactory.createEmptyBorder(12,12,12,12));

            JLabel empLabel = new JLabel("Employees");
            empLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(empLabel);

            JButton listBtn = new JButton("List employees");
            listBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) {
                    runToTable(
                        "SELECT employee_id, name, role, is_active " +
                        "FROM employee ORDER BY is_active DESC, role, name"
                    );
                }
            });
            left.add(listBtn);

            JButton searchBtn = new JButton("Search by name");
            searchBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { searchEmployees(); }
            });
            left.add(searchBtn);

            JButton addBtn = new JButton("Add employee");
            addBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { addEmployeeDialog(); }
            });
            left.add(addBtn);

            left.add(Box.createVerticalStrut(16));
            JLabel updLabel = new JLabel("Update employee");
            updLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(updLabel);

            JButton updateBtn = new JButton("Update (name/role/password/active)");
            updateBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { updateEmployeeDialog(); }
            });
            left.add(updateBtn);

            JButton changeRoleBtn = new JButton("Change role");
            changeRoleBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { changeEmployeeRole(); }
            });
            left.add(changeRoleBtn);

            JButton resetPwBtn = new JButton("Reset password");
            resetPwBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { resetEmployeePassword(); }
            });
            left.add(resetPwBtn);

            left.add(Box.createVerticalStrut(16));
            JLabel manageLabel = new JLabel("Manage employee");
            manageLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(manageLabel);

            JButton deactivateBtn = new JButton("Deactivate");
            deactivateBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { deactivateEmployee(); }
            });
            left.add(deactivateBtn);

            JButton reactivateBtn = new JButton("Reactivate");
            reactivateBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { reactivateEmployee(); }
            });
            left.add(reactivateBtn);

            left.add(Box.createVerticalStrut(16));
            JLabel shiftLabel = new JLabel("Shift schedule");
            shiftLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(shiftLabel);

            JButton createShiftBtn = new JButton("Create shift");
            createShiftBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { createShift(); }
            });
            left.add(createShiftBtn);

            JButton updateShiftBtn = new JButton("Update shift times");
            updateShiftBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { updateShiftTimes(); }
            });
            left.add(updateShiftBtn);

            JButton deleteShiftBtn = new JButton("Delete shift");
            deleteShiftBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { deleteShift(); }
            });
            left.add(deleteShiftBtn);

            JButton assignShiftBtn = new JButton("Assign employee to shift");
            assignShiftBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { assignEmployeeToShift(); }
            });
            left.add(assignShiftBtn);

            JButton removeAssignBtn = new JButton("Remove employee from shift");
            removeAssignBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { removeEmployeeFromShift(); }
            });
            left.add(removeAssignBtn);

            JButton listShiftsDateBtn = new JButton("List shifts by date");
            listShiftsDateBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { listShiftsByDate(); }
            });
            left.add(listShiftsDateBtn);

            JButton listShiftsEmpBtn = new JButton("List shifts for employee");
            listShiftsEmpBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { listShiftsForEmployee(); }
            });
            left.add(listShiftsEmpBtn);

            // UPDATE INVENTORY
            left.add(Box.createVerticalStrut(16));
            JLabel inventoryLabel = new JLabel("Manage Inventory");
            inventoryLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(inventoryLabel);

            JButton listInventoryBtn = new JButton("List Inventory");
            listInventoryBtn.addActionListener(new ActionListener() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    runToTable(
                        "SELECT ingredient_id, name, unit, servings_per_unit, current_quantity, par_level, " +
                        "reorder_point, cost_per_unit, lead_time_days, is_perishable, " +
                        "shelf_life_days, allergen_info, is_active " +
                        "FROM inventory ORDER BY ingredient_id ASC"
                    );
                }
            });
            left.add(listInventoryBtn);

            JButton addInventoryBtn = new JButton("Add Inventory Item");
            addInventoryBtn.addActionListener(new ActionListener() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    addInventoryItem();
                }
            });
            left.add(addInventoryBtn);

            JButton updateInventoryBtn = new JButton("Update Item/Quantity");
            updateInventoryBtn.addActionListener(new ActionListener() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    showInventoryUpdateDialog();
                }
            });
            left.add(updateInventoryBtn);

            JButton deleteInventoryBtn = new JButton("Delete Item");
            deleteInventoryBtn.addActionListener(new ActionListener() {
                @Override
                public void actionPerformed(ActionEvent e) {
                    showInventoryDeleteDialog();
                }
            });
            left.add(deleteInventoryBtn);

            /** Manager Menu button */
            left.add(Box.createVerticalStrut(16));
            JLabel menuLabel = new JLabel("Menu Management");
            menuLabel.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(menuLabel);

            JButton manageMenuBtn = new JButton("Manage Menu");
            manageMenuBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    cards.show(content, "menu");
                    menuPanel.refreshAll();
                }
            });
            left.add(manageMenuBtn);

            /** Back to manager functions button */
            JButton backToMgrBtn = new JButton("Back to Manager Home");
            backToMgrBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    cards.show(content, "table");
                }
            });
            left.add(backToMgrBtn);

            left.add(Box.createVerticalStrut(16));
            JLabel coming = new JLabel("Reports");
            coming.setBorder(BorderFactory.createEmptyBorder(0,0,6,0));
            left.add(coming);

            JButton salesReportBtn  = new JButton("Sales Report");
            salesReportBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    showSalesReportPrompt();
                }
            });
            left.add(salesReportBtn);

            JButton xReportBtn  = new JButton("X Report");
            xReportBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    cards.show(content, "table");
                }
            });
            left.add(xReportBtn);

            JButton zReportBtn  = new JButton("Z Report");
            zReportBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    cards.show(content, "table");
                }
            });
            left.add(zReportBtn);

            JButton restockReportBtn  = new JButton("Restock Report");
            restockReportBtn.addActionListener(new ActionListener() {
                @Override public void actionPerformed(ActionEvent e) { 
                    cards.show(content, "table");
                }
            });
            left.add(restockReportBtn);

            // Wrap the left column so it scrolls reliably
            JPanel leftWrapper = new JPanel(new BorderLayout());
            // Put the tall BoxLayout panel at the TOP of the wrapper so its preferred height is respected
            leftWrapper.add(left, BorderLayout.NORTH);

            JScrollPane leftScroll = new JScrollPane(leftWrapper);
            leftScroll.setBorder(BorderFactory.createEmptyBorder());
            leftScroll.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
            leftScroll.setVerticalScrollBarPolicy(ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED);
            leftScroll.getVerticalScrollBar().setUnitIncrement(16); // smoother wheel

            // Give the column a fixed width; height will scroll
            left.setPreferredSize(new Dimension(260, left.getPreferredSize().height));

            add(leftScroll, BorderLayout.WEST);

            /** manager panel that supports all manager actions */
            model = new DefaultTableModel();
            table = new JTable(model);
            reportTitleLabel = new JLabel(" ", SwingConstants.CENTER); // Initialize with a space
            reportTitleLabel.setBorder(BorderFactory.createEmptyBorder(5, 5, 5, 5)); // Add padding
            JScrollPane tableScroll = new JScrollPane(table);
            JPanel tableCardPanel = new JPanel(new BorderLayout()); // Create a wrapper panel
            tableCardPanel.add(reportTitleLabel, BorderLayout.NORTH); // Add label to the top
            tableCardPanel.add(tableScroll, BorderLayout.CENTER); // Add table below it

            cards = new CardLayout();
            content = new JPanel(cards);
            content.add(tableCardPanel, "table"); 

            menuPanel = new MenuManagerPanel();
            content.add(menuPanel, "menu");
            add(content, BorderLayout.CENTER);
        }

        /**
         * Displays a dialog to get a date/time range from the user and then
         * executes a report query, displaying the results in the main table.
         */
        private void showSalesReportPrompt() {
            // Create input fields with example values
            JTextField startField = new JTextField("2025-10-08 00:00:00");
            JTextField endField = new JTextField("2025-10-08 23:59:59");

            // Create panel to hold the labels and text fields
            JPanel panel = new JPanel(new GridLayout(0, 1, 4, 4));
            panel.add(new JLabel("Start Time (YYYY-MM-DD HH:MM:SS):"));
            panel.add(startField);
            panel.add(new JLabel("End Time (YYYY-MM-DD HH:MM:SS):"));
            panel.add(endField);

            // Show custom dialog
            int result = JOptionPane.showConfirmDialog(this, panel, "Enter Sales Report Time Window",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);

            // If user clicks "OK", execute the query
            if (result == JOptionPane.OK_OPTION) {
                String startTimeStr = startField.getText().trim();
                String endTimeStr = endField.getText().trim();
                
                String sql = "SELECT mi.name AS item_name, SUM(oi.qty * oi.unit_price) AS total_sales " +
                            "FROM order_item AS oi " +
                            "JOIN menu_item AS mi ON oi.menu_item_id = mi.menu_item_id " +
                            "JOIN \"order\" AS o ON oi.order_id = o.order_id " +
                            "WHERE o.created_at BETWEEN ? AND ? " +
                            "GROUP BY mi.name " +
                            "ORDER BY total_sales DESC;";

                try {
                    // Convert strings to SQL Timestamps
                    Timestamp startTimestamp = Timestamp.valueOf(startTimeStr);
                    Timestamp endTimestamp = Timestamp.valueOf(endTimeStr);
                    
                    // Title
                    String reportTitle = "Sales Report from " + startTimeStr + " to " + endTimeStr;
                    reportTitleLabel.setText(reportTitle);
                    
                    runToTable(sql, startTimestamp, endTimestamp);
                    
                } catch (IllegalArgumentException e) {
                    JOptionPane.showMessageDialog(this, "Invalid date/time format. Please use YYYY-MM-DD HH:MM:SS.", "Format Error", JOptionPane.ERROR_MESSAGE);
                }
            }
        }

        /**
         * Executes the given SQL (expects a {@code SELECT} or a DML with {@code RETURNING})
         * and renders the {@link ResultSet} into the center table.
         *
         * @param sql the SQL statement with JDBC {@code ?} placeholders.
         * @param params bound parameters corresponding to the placeholders.
         */
        private void runToTable(String sql, Object... params) {
            try (PreparedStatement ps = GUI.conn.prepareStatement(sql)) {
                for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
                try (ResultSet rs = ps.executeQuery()) {
                    fillTable(rs);
                }
            } catch (SQLException ex) {
                JOptionPane.showMessageDialog(this, ex.getMessage(), "DB error", JOptionPane.ERROR_MESSAGE);
            }
        }

        /**
         * Fills the table model from a {@link ResultSet} by copying column labels and rows.
         *
         * @param rs the {@link ResultSet} to read.
         * @throws SQLException if a JDBC error occurs while reading {@code rs}.
         */
        private void fillTable(ResultSet rs) throws SQLException {
            ResultSetMetaData md = rs.getMetaData();
            int cols = md.getColumnCount();

            DefaultTableModel m = (DefaultTableModel) table.getModel();
            m.setRowCount(0);
            m.setColumnCount(0);

            for (int i = 1; i <= cols; i++) m.addColumn(md.getColumnLabel(i));
            while (rs.next()) {
                Object[] row = new Object[cols];
                for (int i = 1; i <= cols; i++) row[i - 1] = rs.getObject(i);
                m.addRow(row);
            }
        }

        /**
         * Prompts for a name fragment and lists matching employees (case-insensitive).
         * Populates the results table with employee_id, name, role, and active status.
         */
        private void searchEmployees() {
            String q = JOptionPane.showInputDialog(this, "Search name contains:");
            if (q == null) return;
            String sql =
                "SELECT employee_id, name, role, is_active " +
                "FROM employee WHERE name ILIKE '%' || ? || '%' ORDER BY name";
            runToTable(sql, q);
        }

        /**
         * Opens a dialog to add a new employee (name, role, temp password, active flag).
         * Inserts the employee and returns the new row to the results table.
         */
        private void addEmployeeDialog() {
            JTextField name = new JTextField();
            JComboBox<String> role = new JComboBox<>(new String[]{"manager","cook","cashier"});
            JTextField pw = new JTextField();
            JCheckBox active = new JCheckBox("Active", true);

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Name:")); form.add(name);
            form.add(new JLabel("Role:")); form.add(role);
            form.add(new JLabel("Temp password:")); form.add(pw);
            form.add(active);

            int ok = JOptionPane.showConfirmDialog(this, form, "Add employee",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql =
                "INSERT INTO employee (name, role, password_hash, is_active) " +
                "VALUES (?, ?::employee_role_enum, ?, COALESCE(?, TRUE)) " +
                "RETURNING employee_id, name, role, is_active";
            runToTable(sql,
                name.getText().trim(),
                role.getSelectedItem().toString(),
                pw.getText(),
                active.isSelected()
            );
        }

        /**
         * Opens a dialog to partially update an employee by ID.
         * Any blank field is treated as "no change" using {@code COALESCE} in SQL.
         * Updates name, role, password_hash, and/or active status.
         */
        private void updateEmployeeDialog() {
            JTextField id = new JTextField();
            JTextField newName = new JTextField();
            JComboBox<String> newRole = new JComboBox<>(new String[]{"", "manager","cook","cashier"});
            JTextField newPw = new JTextField();
            JComboBox<String> newActive = new JComboBox<>(new String[]{"", "true","false"});

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Employee ID (required):")); form.add(id);
            form.add(new JLabel("New name (optional):"));    form.add(newName);
            form.add(new JLabel("New role (optional):"));    form.add(newRole);
            form.add(new JLabel("New password (optional):"));form.add(newPw);
            form.add(new JLabel("New active (optional):"));  form.add(newActive);

            int ok = JOptionPane.showConfirmDialog(this, form, "Update employee (partial)",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String rl = "".equals(newRole.getSelectedItem()) ? null : newRole.getSelectedItem().toString();
            Boolean act = null;
            if ("true".equals(newActive.getSelectedItem())) act = true;
            if ("false".equals(newActive.getSelectedItem())) act = false;

            String sql =
                "UPDATE employee e SET " +
                "name = COALESCE(?, e.name), " +
                "role = COALESCE(?::employee_role_enum, e.role), " +
                "password_hash = COALESCE(?, e.password_hash), " +
                "is_active = COALESCE(?, e.is_active) " +
                "WHERE employee_id = ? " +
                "RETURNING employee_id, name, role, is_active";

            runToTable(sql,
                blankToNull(newName.getText()),
                rl,
                blankToNull(newPw.getText()),
                act,
                parseId(id.getText())
            );
        }

        /**
         * Converts a blank string to {@code null}; otherwise returns a trimmed value.
         *
         * @param s input string which may be blank.
         * @return {@code null} if blank or null; trimmed string otherwise.
         */
        private String blankToNull(String s) {
            return (s == null || s.trim().isEmpty()) ? null : s.trim();
        }

        /**
         * Parses a string into an integer employee/shift ID, showing an error dialog on failure.
         *
         * @param txt the input text to parse.
         * @return the parsed integer.
         * @throws NumberFormatException rethrown after showing an error dialog.
         */
        private Integer parseId(String txt) {
            try { return Integer.parseInt(txt.trim()); }
            catch (Exception e) {
                JOptionPane.showMessageDialog(this, "Invalid ID.", "Error", JOptionPane.ERROR_MESSAGE);
                throw e;
            }
        }

        /**
         * Prompts for an employee ID and a new role, then updates the role.
         * Returns the updated row in the results table.
         */
        private void changeEmployeeRole() {
            String id = JOptionPane.showInputDialog(this, "Employee ID:");
            if (id == null) return;
            String role = (String) JOptionPane.showInputDialog(this, "New role:",
                "Change role", JOptionPane.PLAIN_MESSAGE, null,
                new String[]{"manager","cook","cashier"}, "cashier");
            if (role == null) return;

            String sql = "UPDATE employee SET role=?::employee_role_enum WHERE employee_id=? " +
                        "RETURNING employee_id, name, role, is_active";
            runToTable(sql, role, parseId(id));
        }

        /**
         * Prompts for an employee ID and a new temporary password, then updates it.
         * Returns the updated row in the results table.
         */
        private void resetEmployeePassword() {
            String id = JOptionPane.showInputDialog(this, "Employee ID:");
            if (id == null) return;
            String pw = JOptionPane.showInputDialog(this, "New temporary password:");
            if (pw == null) return;

            String sql = "UPDATE employee SET password_hash=? WHERE employee_id=? " +
                        "RETURNING employee_id, name, role, is_active";
            runToTable(sql, pw, parseId(id));
        }

        /**
         * Prompts for an employee ID and sets {@code is_active = FALSE}.
         * Returns the updated row in the results table.
         */
        private void deactivateEmployee() {
            String id = JOptionPane.showInputDialog(this, "Employee ID to deactivate:");
            if (id == null) return;
            String sql = "UPDATE employee SET is_active=FALSE WHERE employee_id=? " +
                        "RETURNING employee_id, name, role, is_active";
            runToTable(sql, parseId(id));
        }

        /**
         * Prompts for an employee ID and sets {@code is_active = TRUE}.
         * Returns the updated row in the results table.
         */
        private void reactivateEmployee() {
            String id = JOptionPane.showInputDialog(this, "Employee ID to reactivate:");
            if (id == null) return;
            String sql = "UPDATE employee SET is_active=TRUE WHERE employee_id=? " +
                        "RETURNING employee_id, name, role, is_active";
            runToTable(sql, parseId(id));
        }

        /**
         * Opens a dialog to create a new shift in {@code shift_schedule} with date and time range.
         * Inserts the shift and returns the inserted row.
         */
        private void createShift() {
            JTextField d = new JTextField("2025-10-08");
            JTextField start = new JTextField("09:00");
            JTextField end = new JTextField("17:00");

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Date (YYYY-MM-DD):")); form.add(d);
            form.add(new JLabel("Start time (HH:MM):")); form.add(start);
            form.add(new JLabel("End time (HH:MM):"));   form.add(end);

            int ok = JOptionPane.showConfirmDialog(this, form, "Create shift",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql = "INSERT INTO shift_schedule (shift_date, start_time, end_time) " +
                        "VALUES (?::date, ?::time, ?::time) " +
                        "RETURNING schedule_id, shift_date, start_time, end_time";
            runToTable(sql, d.getText().trim(), start.getText().trim(), end.getText().trim());
        }

        /**
         * Opens a dialog to update an existing shift's date and/or time range.
         * Blank fields keep existing values via {@code COALESCE(NULLIF(...),'')}.
         * Returns the updated row.
         */
        private void updateShiftTimes() {
            JTextField sid = new JTextField();
            JTextField d = new JTextField();
            JTextField start = new JTextField();
            JTextField end = new JTextField();

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Schedule ID (required):")); form.add(sid);
            form.add(new JLabel("New Date (YYYY-MM-DD, optional):")); form.add(d);
            form.add(new JLabel("New Start (HH:MM, optional):")); form.add(start);
            form.add(new JLabel("New End (HH:MM, optional):"));   form.add(end);

            int ok = JOptionPane.showConfirmDialog(this, form, "Update shift times",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql = "UPDATE shift_schedule s SET " +
                        "shift_date = COALESCE(NULLIF(?,'')::date, s.shift_date), " +
                        "start_time = COALESCE(NULLIF(?,'')::time, s.start_time), " +
                        "end_time   = COALESCE(NULLIF(?,'')::time, s.end_time) " +
                        "WHERE schedule_id = ? " +
                        "RETURNING schedule_id, shift_date, start_time, end_time";
            runToTable(sql, d.getText().trim(), start.getText().trim(), end.getText().trim(), parseId(sid.getText()));
        }

        /**
         * Deletes a shift and its assignments. Displays the deleted {@code schedule_id}.
         * Performs two statements: delete assignments, then delete the shift (RETURNING).
         */
        private void deleteShift() {
            String sid = JOptionPane.showInputDialog(this, "Schedule ID to delete:");
            if (sid == null) return;

            // remove any assignments then the shift
            String delAssign = "DELETE FROM shift_assignment WHERE schedule_id=?;";
            String delShift  = "DELETE FROM shift_schedule WHERE schedule_id=? " +
                            "RETURNING schedule_id";
            try (PreparedStatement ps1 = GUI.conn.prepareStatement(delAssign);
                PreparedStatement ps2 = GUI.conn.prepareStatement(delShift)) {
                ps1.setObject(1, parseId(sid)); ps1.executeUpdate();
                ps2.setObject(1, parseId(sid));
                try (ResultSet rs = ps2.executeQuery()) { fillTable(rs); }
            } catch (SQLException ex) {
                JOptionPane.showMessageDialog(this, ex.getMessage(), "DB error", JOptionPane.ERROR_MESSAGE);
            }
        }

        /**
         * Opens a dialog to assign an employee to a shift with a role.
         * Inserts into {@code shift_assignment} and returns the inserted row.
         */
        private void assignEmployeeToShift() {
            JTextField sid = new JTextField();
            JTextField eid = new JTextField();
            JComboBox<String> role = new JComboBox<>(new String[]{"manager","cook","cashier"});

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Schedule ID:")); form.add(sid);
            form.add(new JLabel("Employee ID:")); form.add(eid);
            form.add(new JLabel("Role on shift:")); form.add(role);

            int ok = JOptionPane.showConfirmDialog(this, form, "Assign employee to shift",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql = "INSERT INTO shift_assignment (schedule_id, employee_id, role) " +
                        "VALUES (?, ?, ?::employee_role_enum) " +
                        "RETURNING schedule_id, employee_id, role";
            runToTable(sql, parseId(sid.getText()), parseId(eid.getText()), role.getSelectedItem().toString());
        }

        /**
         * Opens a dialog to remove an employee assignment from a shift.
         * Deletes from {@code shift_assignment} and returns the affected IDs.
         */
        private void removeEmployeeFromShift() {
            JTextField sid = new JTextField();
            JTextField eid = new JTextField();

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Schedule ID:")); form.add(sid);
            form.add(new JLabel("Employee ID:")); form.add(eid);

            int ok = JOptionPane.showConfirmDialog(this, form, "Remove employee from shift",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql = "DELETE FROM shift_assignment WHERE schedule_id=? AND employee_id=? " +
                        "RETURNING schedule_id, employee_id";
            runToTable(sql, parseId(sid.getText()), parseId(eid.getText()));
        }

        /**
         * Prompts for a date (YYYY-MM-DD) and lists all shifts with assigned employees for that day.
         */
        private void listShiftsByDate() {
            String d = JOptionPane.showInputDialog(this, "Date (YYYY-MM-DD):");
            if (d == null) return;

            String sql =
                "SELECT s.schedule_id, s.shift_date, s.start_time, s.end_time, " +
                "       sa.employee_id, sa.role " +
                "FROM shift_schedule s " +
                "LEFT JOIN shift_assignment sa ON sa.schedule_id = s.schedule_id " +
                "WHERE s.shift_date = ?::date " +
                "ORDER BY s.start_time, sa.employee_id";
            runToTable(sql, d.trim());
        }

        /**
         * Prompts for an employee ID and lists that employee's scheduled shifts.
         */
        private void listShiftsForEmployee() {
            String e = JOptionPane.showInputDialog(this, "Employee ID:");
            if (e == null) return;

            String sql =
                "SELECT s.schedule_id, s.shift_date, s.start_time, s.end_time, sa.role " +
                "FROM shift_assignment sa " +
                "JOIN shift_schedule s ON s.schedule_id = sa.schedule_id " +
                "WHERE sa.employee_id = ? " +
                "ORDER BY s.shift_date, s.start_time";
            runToTable(sql, parseId(e));
        }

        /**
         *Opens a dialog to add a new inventory item (name, unit, servings, par level,
         * reorder point, cost per unit, lead time (days), perishable, shelf life,
         * allergen info, active).
         *Inserts the inventory item and returns the new row to the table.
         */
        private void addInventoryItem() {
            JTextField name = new JTextField();
            JTextField unit = new JTextField();
            JTextField servings = new JTextField();
            JTextField parLevel = new JTextField();
            JTextField reorderPoint = new JTextField();
            JTextField cost = new JTextField();
            JTextField leadTime = new JTextField();
            JCheckBox perishable = new JCheckBox();
            JTextField shelfLife = new JTextField();
            JTextField allergen = new JTextField();
            JCheckBox active = new JCheckBox("", true);
            JTextField currQuantity = new JTextField();

            JPanel form = new JPanel(new GridLayout(0,1,4,4));
            form.add(new JLabel("Name:")); form.add(name);
            form.add(new JLabel("Unit:")); form.add(unit);
            form.add(new JLabel("Servings per unit:")); form.add(servings);
            form.add(new JLabel("Par level:")); form.add(parLevel);
            form.add(new JLabel("Reorder point:")); form.add(reorderPoint);
            form.add(new JLabel("Cost per unit:")); form.add(cost);
            form.add(new JLabel("Lead time (days):")); form.add(leadTime);
            form.add(new JLabel("Perishable:")); form.add(perishable);
            form.add(new JLabel("Shelf life (days):")); form.add(shelfLife);
            form.add(new JLabel("Allergen info:")); form.add(allergen);
            form.add(new JLabel("Active:")); form.add(active);
            form.add(new JLabel("Current Quantity:")); form.add(currQuantity);

            int ok = JOptionPane.showConfirmDialog(this, form, "Add Inventory Item",
                            JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (ok != JOptionPane.OK_OPTION) return;

            String sql = "INSERT INTO inventory " +
                        "(name, unit, servings_per_unit, par_level, reorder_point, cost_per_unit, " +
                        "lead_time_days, is_perishable, shelf_life_days, allergen_info, is_active, current_quantity) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                        "RETURNING ingredient_id, name, unit, servings_per_unit, par_level, reorder_point, cost_per_unit, lead_time_days, is_perishable, shelf_life_days, allergen_info, is_active, current_quantity";

            runToTable(sql,
                name.getText().trim(),
                unit.getText().trim(),
                Integer.parseInt(servings.getText().trim()),
                Integer.parseInt(parLevel.getText().trim()),
                Integer.parseInt(reorderPoint.getText().trim()),
                Double.parseDouble(cost.getText().trim()),
                Integer.parseInt(leadTime.getText().trim()),
                perishable.isSelected(),
                shelfLife.getText().trim().isEmpty() ? null : Integer.parseInt(shelfLife.getText().trim()),
                allergen.getText().trim(),
                active.isSelected(),
                Integer.parseInt(currQuantity.getText().trim())
            );
        }

        /*
         * Opens a dialog to update an inventory item (name, unit, servings, par level,
         * reorder point, cost per unit, lead time (days), perishable, shelf life,
         * allergen info, active).
         *Updates the inventory item and returns new value(s) to correct column/row.
         */
        private void showInventoryUpdateDialog() {
            JPanel panel = new JPanel(new GridLayout(0, 2));

            JTextField idField = new JTextField();
            JTextField nameField = new JTextField();
            JTextField quantityField = new JTextField();
            JTextField unitField = new JTextField();
            JTextField servingsField = new JTextField();
            JTextField parLevelField = new JTextField();
            JTextField reorderPointField = new JTextField();
            JTextField costField = new JTextField();
            JTextField leadTimeField = new JTextField();
            JTextField shelfLifeField = new JTextField();
            JTextField allergenField = new JTextField();
            JCheckBox activeField = new JCheckBox("", true);

            panel.add(new JLabel("Ingredient ID (required):"));
            panel.add(idField);
            panel.add(new JLabel("New Name (optional):"));
            panel.add(nameField);
            panel.add(new JLabel("Current Quantity (optional):"));
            panel.add(quantityField);
            panel.add(new JLabel("New Units (optional):"));
            panel.add(unitField);
            panel.add(new JLabel("New Servings (optional):"));
            panel.add(servingsField);
            panel.add(new JLabel("New Par Level (optional):"));
            panel.add(parLevelField);
            panel.add(new JLabel("New Reorder Point (optional):"));
            panel.add(reorderPointField);
            panel.add(new JLabel("New Cost (optional):"));
            panel.add(costField);
            panel.add(new JLabel("New Lead Time (optional):"));
            panel.add(leadTimeField);
            panel.add(new JLabel("New Shelf Life (optional):"));
            panel.add(shelfLifeField);
            panel.add(new JLabel("New Allergen(s) (optional):"));
            panel.add(allergenField);
            panel.add(new JLabel("Active (optional, leave unchecked to skip):"));
            panel.add(activeField);

            int result = JOptionPane.showConfirmDialog(null, panel, "Update Inventory Item",
                    JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);

            if (result == JOptionPane.OK_OPTION) {
                try {
                    int ingredientId = Integer.parseInt(idField.getText());
                    String name = nameField.getText().trim();
                    Integer quantity = quantityField.getText().isEmpty() ? null : Integer.parseInt(quantityField.getText());
                    String unit = unitField.getText().trim().isEmpty() ? null : unitField.getText().trim();
                    Integer servings = servingsField.getText().isEmpty() ? null : Integer.parseInt(servingsField.getText());
                    Integer parLevel = parLevelField.getText().isEmpty() ? null : Integer.parseInt(parLevelField.getText());
                    Integer reorderPoint = reorderPointField.getText().isEmpty() ? null : Integer.parseInt(reorderPointField.getText());
                    Double cost = costField.getText().isEmpty() ? null : Double.parseDouble(costField.getText());
                    Integer leadTime = leadTimeField.getText().isEmpty() ? null : Integer.parseInt(leadTimeField.getText());
                    Integer shelfLife = shelfLifeField.getText().isEmpty() ? null : Integer.parseInt(shelfLifeField.getText());
                    String allergens = allergenField.getText().trim().isEmpty() ? null : allergenField.getText().trim();
                    Boolean isActive = activeField.isSelected();

                    updateInventoryItemOptional(ingredientId, name, quantity, unit, servings, parLevel,
                            reorderPoint, cost, leadTime, shelfLife, allergens, isActive);
                } catch (NumberFormatException e) {
                    JOptionPane.showMessageDialog(this, "Please enter valid numbers in numeric fields.");
                }
            }
        }

        /*
         * SQL query to run in showInventoryUpdateDialog()
         */
        private void updateInventoryItemOptional(int ingredientId, String name, Integer quantity, String unit,
                                                Integer servings, Integer parLevel, Integer reorderPoint,
                                                Double cost, Integer leadTime, Integer shelfLife,
                                                String allergens, Boolean isActive) {

            StringBuilder sql = new StringBuilder("UPDATE inventory SET ");
            ArrayList<Object> params = new ArrayList<>();

            if (quantity != null) { sql.append("current_quantity = ?, "); params.add(quantity); }
            if (name != null && !name.isEmpty()) { sql.append("name = ?, "); params.add(name); }
            if (unit != null) { sql.append("unit = ?, "); params.add(unit); }
            if (servings != null) { sql.append("servings_per_unit = ?, "); params.add(servings); }
            if (parLevel != null) { sql.append("par_level = ?, "); params.add(parLevel); }
            if (reorderPoint != null) { sql.append("reorder_point = ?, "); params.add(reorderPoint); }
            if (cost != null) { sql.append("cost_per_unit = ?, "); params.add(cost); }
            if (leadTime != null) { sql.append("lead_time_days = ?, "); params.add(leadTime); }
            if (shelfLife != null) { sql.append("shelf_life_days = ?, "); params.add(shelfLife); }
            if (allergens != null) { sql.append("allergen_info = ?, "); params.add(allergens); }
            if (isActive != null) { sql.append("is_active = ?, "); params.add(isActive); }

            if (params.isEmpty()) {
                JOptionPane.showMessageDialog(this, "No fields to update.");
                return;
            }

            sql.setLength(sql.length() - 2);
            sql.append(" WHERE ingredient_id = ?");
            params.add(ingredientId);

            try (PreparedStatement pst = conn.prepareStatement(sql.toString())) {
                for (int i = 0; i < params.size(); i++) {
                    pst.setObject(i + 1, params.get(i));
                }

                int updated = pst.executeUpdate();
                if (updated > 0) {
                    JOptionPane.showMessageDialog(this, "Inventory updated successfully!");
                } else {
                    JOptionPane.showMessageDialog(this, "No item found with that ID.");
                }
            } catch (SQLException e) {
                e.printStackTrace();
                JOptionPane.showMessageDialog(this, "Error updating inventory: " + e.getMessage());
            }
        }


        /*
         * Opens a dialog to delete an inventory item (name, unit, servings, par level,
         * reorder point, cost per unit, lead time (days), perishable, shelf life,
         * allergen info, active).
         *Deletes the inventory item from inventory/database.
         */
        private void showInventoryDeleteDialog() {
            String input = JOptionPane.showInputDialog(this, "Enter Ingredient ID to delete:");
            if (input == null || input.trim().isEmpty()) return;

            try {
                int ingredientId = Integer.parseInt(input.trim());

                int confirm = JOptionPane.showConfirmDialog(this,
                        "Are you sure you want to delete item ID " + ingredientId + "?",
                        "Confirm Delete", JOptionPane.YES_NO_OPTION);

                if (confirm == JOptionPane.YES_OPTION) {
                    deleteInventoryItem(ingredientId);
                }
            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, "Please enter a valid numeric ID.");
            }
        }
        /*
         * SQL query to run in showInventoryDeleteDialog()
         */
        private void deleteInventoryItem(int ingredientId) {
            String sql = "DELETE FROM inventory WHERE ingredient_id = ?";

            try (PreparedStatement pst = conn.prepareStatement(sql)) {
                pst.setInt(1, ingredientId);

                int deleted = pst.executeUpdate();
                if (deleted > 0) {
                    JOptionPane.showMessageDialog(this, "Item deleted successfully!");
                } else {
                    JOptionPane.showMessageDialog(this, "No item found with that ID.");
                }
            } catch (SQLException e) {
                e.printStackTrace();
                JOptionPane.showMessageDialog(this, "Error deleting inventory item: " + e.getMessage());
            }
        }



        /** panel for manager to view, add, update, or delete menu items */
        private final class MenuManagerPanel extends JPanel {
            // creates a data transfer object for a menu item
            static class CategoryDTO {
                private int categoryID;
                private String categoryName;

                public CategoryDTO(int categoryID, String categoryName) {
                    this.categoryID = categoryID;
                    this.categoryName = categoryName;
                }

                public int getCategoryID() { return categoryID; }
                public String getCategoryName() { return categoryName; }

                @Override public String toString() {
                        return categoryName;
                }
            }

            static class MenuItemRow {
                private int itemID;
                private String itemName;
                private BigDecimal itemPrice;
                private int categoryID;
                private String categoryName;
                private boolean active;

                public MenuItemRow(int itemID, String itemName, BigDecimal itemPrice, int categoryID, String categoryName, boolean active) {
                    this.itemID = itemID;
                    this.itemName = itemName;
                    this.itemPrice = itemPrice;
                    this.categoryID = categoryID;
                    this.categoryName = categoryName;
                    this.active = active;
                }

                public int getItemID() { return itemID; }
                public String getItemName() { return itemName; }
                public BigDecimal getItemPrice() { return itemPrice; }
                public int getCategoryID() { return categoryID; }
                public String getCategoryName() { return categoryName; }
                public boolean isActive() { return active; }

                public void setItemName(String itemName) { this.itemName = itemName; }
                public void setItemPrice(BigDecimal itemPrice) { this.itemPrice = itemPrice; }
                public void setCategoryID(int categoryID) { this.categoryID = categoryID; }
                public void setCategoryName(String categoryName) { this.categoryName = categoryName; }
                public void setActive(boolean active) { this.active = active; }
            }

            static class MenuTableModel extends AbstractTableModel {
                private String[] columnNames = {"Item ID", "Item Name", "Item Price", "Category", "Active"};
                private List<MenuItemRow> data;

                public MenuTableModel(List<MenuItemRow> data) {
                    this.data = data;
                }

                @Override public int getRowCount() { return data.size(); }
                @Override public int getColumnCount() { return columnNames.length; }
                @Override public String getColumnName(int col) { return columnNames[col]; }
                @Override public Object getValueAt(int row, int col) {
                    MenuItemRow item = data.get(row);
                    switch (col) {
                        case 0: return item.getItemID();
                        case 1: return item.getItemName();
                        case 2: return "$" + item.getItemPrice();
                        case 3: return item.getCategoryName();
                        case 4: return item.isActive();
                        default: return null;
                    }
                }

                @Override public boolean isCellEditable(int row, int col) {
                    return col != 0; // Item ID is not editable
                }

                @Override public void setValueAt(Object value, int row, int col) {
                    MenuItemRow item = data.get(row);
                    switch (col) {
                        case 1: item.setItemName((String)value); break;
                        case 2: item.setItemPrice(new BigDecimal(value.toString())); break;
                        case 3: 
                            if (value instanceof CategoryDTO) {
                                CategoryDTO category = (CategoryDTO)value;
                                item.setCategoryID(category.getCategoryID());
                                item.setCategoryName(category.getCategoryName());
                            }
                            break;
                        case 4: item.setActive((Boolean)value); break;
                    }
                    fireTableCellUpdated(row, col);
                }

                public MenuItemRow getMenuItemAt(int row) {
                    return data.get(row);
                }
            }

            // setting up the GUI components
            private final java.util.List<MenuItemRow> data = new java.util.ArrayList<>();
            private final MenuTableModel tableModel = new MenuTableModel(data);
            private final JTable table = new JTable(tableModel);

            private final JTextField itemIDField = new JTextField(6);
            private final JTextField itemNameField = new JTextField(16);
            private final JTextField itemPriceField = new JTextField(8);
            private final JComboBox<CategoryDTO> categoryComboBox = new JComboBox<>();
            private final JCheckBox activeCheckBox = new JCheckBox("Active");

            private final JButton addButton = new JButton("Add Item");
            private final JButton updateButton = new JButton("Update Item");
            private final JButton deleteButton = new JButton("Delete Item");
            private final JButton refreshButton = new JButton("Refresh Menu");

            MenuManagerPanel() {
                // Table setup
                super(new BorderLayout(8,8));
                table.setRowHeight(24);
                add(new JScrollPane(table), BorderLayout.CENTER);

                JPanel top = new JPanel(new BorderLayout(6, 6));

                // Form panel
                JPanel formPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 8));
                formPanel.add(new JLabel("Item ID:"));
                formPanel.add(itemIDField);
                formPanel.add(new JLabel("Item Name:"));
                formPanel.add(itemNameField);
                formPanel.add(new JLabel("Item Price:"));
                formPanel.add(itemPriceField);
                formPanel.add(new JLabel("Category:"));
                formPanel.add(categoryComboBox);
                formPanel.add(activeCheckBox);
                add(formPanel, BorderLayout.NORTH);

                // Button panel
                JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 8));
                buttonPanel.add(addButton);
                buttonPanel.add(updateButton);
                buttonPanel.add(deleteButton);
                buttonPanel.add(refreshButton);
                add(buttonPanel, BorderLayout.SOUTH);

                top.add(formPanel, BorderLayout.CENTER);
                top.add(buttonPanel, BorderLayout.SOUTH);

                // --- bottom area = table in a scroll pane ---
                JScrollPane tableScroll = new JScrollPane(table);

                // vertical split: top (form+buttons) / bottom (table)
                JSplitPane split = new JSplitPane(JSplitPane.VERTICAL_SPLIT, top, tableScroll);
                split.setResizeWeight(0.0);       // keep top at preferred height
                split.setDividerLocation(180);    // initial height; tweak to taste
                split.setBorder(null);

                add(split, BorderLayout.CENTER);

                // Button actions
                addButton.addActionListener(e -> addItem());
                updateButton.addActionListener(e -> updateItem());
                deleteButton.addActionListener(e -> deleteItem());
                refreshButton.addActionListener(e -> refreshAll());

                // Table selection listener
                table.getSelectionModel().addListSelectionListener(e -> {
                    int selectedRow = table.getSelectedRow();
                    if (selectedRow >= 0) {
                        MenuItemRow item = tableModel.getMenuItemAt(selectedRow);
                        itemIDField.setText(String.valueOf(item.getItemID()));
                        itemNameField.setText(item.getItemName());
                        itemPriceField.setText(item.getItemPrice().toString());
                        for (int i = 0; i < categoryComboBox.getItemCount(); i++) {
                            if (categoryComboBox.getItemAt(i).getCategoryID() == item.getCategoryID()) {
                                categoryComboBox.setSelectedIndex(i);
                                break;
                            }
                        }
                        activeCheckBox.setSelected(item.isActive());
                    }
                });

                // Loads Menu and Category data
                refreshAll();
            }

            void refreshAll() {
                loadCategories();
                loadMenuItems();
            }

            private void loadCategories() {
                try(PreparedStatement ps = GUI.conn.prepareStatement("SELECT category_id, name FROM category ORDER BY category_id");
                    ResultSet rs = ps.executeQuery()) {
                    categoryComboBox.removeAllItems();
                    while (rs.next()) {
                        int categoryID = rs.getInt("category_id");
                        String categoryName = rs.getString("name");
                        categoryComboBox.addItem(new CategoryDTO(categoryID, categoryName));
                    }
                } catch (SQLException e) {
                    e.printStackTrace();
                    JOptionPane.showMessageDialog(this, "Error loading categories: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }

            private void loadMenuItems() {
                data.clear();
                try(PreparedStatement ps = GUI.conn.prepareStatement(
                        "SELECT mi.menu_item_id, mi.name, mi.price, mi.category_id, COALESCE(c.name,'(none)') AS cat_name, mi.is_active " +
                        "FROM menu_item mi LEFT JOIN category c ON mi.category_id = c.category_id ORDER BY c.display_order, mi.name");
                    ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        int itemID = rs.getInt("menu_item_id");
                        String itemName = rs.getString("name");
                        BigDecimal itemPrice = rs.getBigDecimal("price");
                        int categoryID = rs.getInt("category_id");
                        String categoryName = rs.getString("cat_name");
                        boolean active = rs.getBoolean("is_active");
                        data.add(new MenuItemRow(itemID, itemName, itemPrice, categoryID, categoryName, active));
                    }
                    tableModel.fireTableDataChanged();
                } catch (SQLException e) {
                    e.printStackTrace();
                    JOptionPane.showMessageDialog(this, "Error loading menu items: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }

            private void addItem() {
                String itemName = itemNameField.getText().trim();
                String itemPriceStr = itemPriceField.getText().trim();
                CategoryDTO selectedCategory = (CategoryDTO)categoryComboBox.getSelectedItem();
                boolean active = activeCheckBox.isSelected();

                if (itemName.isEmpty() || itemPriceStr.isEmpty() || selectedCategory == null) {
                    JOptionPane.showMessageDialog(this, "Please fill in all fields.", "Input Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                BigDecimal itemPrice;
                try {
                    itemPrice = new BigDecimal(itemPriceStr);
                } catch (NumberFormatException e) {
                    JOptionPane.showMessageDialog(this, "Invalid price format.", "Input Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                try(PreparedStatement ps = GUI.conn.prepareStatement(
                        "INSERT INTO menu_item (name, price, category_id, is_active) VALUES (?, ?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, itemName);
                    ps.setBigDecimal(2, itemPrice);
                    ps.setInt(3, selectedCategory.getCategoryID());
                    ps.setBoolean(4, active);
                    int affectedRows = ps.executeUpdate();
                    if (affectedRows == 0) {
                        throw new SQLException("Creating menu item failed, no rows affected.");
                    }
                    refreshAll();
                    try (ResultSet generatedKeys = ps.getGeneratedKeys()) {
                        if (generatedKeys.next()) {
                            int newItemID = generatedKeys.getInt(1);
                            data.add(new MenuItemRow(newItemID, itemName, itemPrice, selectedCategory.getCategoryID(), selectedCategory.getCategoryName(), active));
                            tableModel.fireTableDataChanged();
                        } else {
                            throw new SQLException("Creating menu item failed, no ID obtained.");
                        }
                    }
                } catch (SQLException e) {
                    e.printStackTrace();
                    JOptionPane.showMessageDialog(this, "Error adding menu item: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }

            private void updateItem() {
                int selectedRow = table.getSelectedRow();
                if (selectedRow < 0) {
                    JOptionPane.showMessageDialog(this, "Please select an item to update.", "Selection Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                MenuItemRow item = tableModel.getMenuItemAt(selectedRow);
                String itemName = itemNameField.getText().trim();
                String itemPriceStr = itemPriceField.getText().trim();
                CategoryDTO selectedCategory = (CategoryDTO)categoryComboBox.getSelectedItem();
                boolean active = activeCheckBox.isSelected();

                if (itemName.isEmpty() || itemPriceStr.isEmpty() || selectedCategory == null) {
                    JOptionPane.showMessageDialog(this, "Please fill in all fields.", "Input Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                BigDecimal itemPrice;
                try {
                    itemPrice = new BigDecimal(itemPriceStr);
                } catch (NumberFormatException e) {
                    JOptionPane.showMessageDialog(this, "Invalid price format.", "Input Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                try(PreparedStatement ps = GUI.conn.prepareStatement(
                        "UPDATE menu_item SET name = ?, price = ?, category_id = ?, is_active = ? WHERE menu_item_id = ?")) {
                    ps.setString(1, itemName);
                    ps.setBigDecimal(2, itemPrice);
                    ps.setInt(3, selectedCategory.getCategoryID());
                    ps.setBoolean(4, active);
                    ps.setInt(5, item.getItemID());
                    ps.executeUpdate();
                    refreshAll();

                    // Update local data
                    item.setItemName(itemName);
                    item.setItemPrice(itemPrice);
                    item.setCategoryID(selectedCategory.getCategoryID());
                    item.setCategoryName(selectedCategory.getCategoryName());
                    item.setActive(active);
                    tableModel.fireTableRowsUpdated(selectedRow, selectedRow);
                } catch (SQLException e) {
                    e.printStackTrace();
                    JOptionPane.showMessageDialog(this, "Error updating menu item: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }

            private void deleteItem() {
                String itemIDStr = itemIDField.getText().trim();
                if (itemIDStr.isEmpty()) {
                    JOptionPane.showMessageDialog(this, "Please enter an Item ID to delete.", "Input Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }
                int id = Integer.parseInt(itemIDStr);
                int confirm = JOptionPane.showConfirmDialog(this, "Are you sure you want to delete item ID " + id + "?", "Confirm Delete", JOptionPane.YES_NO_OPTION);
                if (confirm != JOptionPane.YES_OPTION) { return; }

                try(PreparedStatement ps = GUI.conn.prepareStatement("DELETE FROM menu_item WHERE menu_item_id = ?")) {
                    ps.setInt(1, id);
                    ps.executeUpdate();
                    refreshAll(); 
                
                } catch (SQLException e) {
                    e.printStackTrace();
                    JOptionPane.showMessageDialog(this, "Error deleting menu item: " + e.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }

            private void selectCategoryById(int id){
                for (int i = 0; i < categoryComboBox.getItemCount(); i++) {
                    if (categoryComboBox.getItemAt(i).getCategoryID() == id) {
                        categoryComboBox.setSelectedIndex(i);
                        break;
                    }
                }
            }

        }
    }
}