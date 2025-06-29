module DatatablesHelper
  # Generate DataTables configuration for consistent usage across the app
  def datatables_config(table_id, options = {})
    config = {
      "pageLength" => options[:page_length] || 25,
      "lengthMenu" => [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
      "responsive" => true,
      "processing" => true,
      "search" => {
        "regex" => true,
        "smart" => true
      },
      "language" => datatables_language(options[:entity_name] || "records")
    }

    # Add export buttons if requested
    if options[:export]
      config["dom"] = "Bfrtip"
      config["buttons"] = export_buttons(options[:filename] || table_id)
    else
      config["dom"] = "frtip"
    end

    # Add custom column definitions if provided
    if options[:column_defs]
      config["columnDefs"] = options[:column_defs]
    end

    # Add default sorting if provided
    if options[:default_sort]
      config["order"] = options[:default_sort]
    end

    config
  end

  # Generate export buttons configuration
  def export_buttons(filename_base)
    timestamp = Time.current.strftime('%Y%m%d')
    
    [
      {
        "extend" => "copy",
        "text" => '<i class="fas fa-copy"></i> Copy',
        "className" => "btn btn-outline-primary btn-sm"
      },
      {
        "extend" => "csv",
        "text" => '<i class="fas fa-file-csv"></i> CSV',
        "className" => "btn btn-outline-success btn-sm",
        "filename" => "#{filename_base}_#{timestamp}"
      },
      {
        "extend" => "excel", 
        "text" => '<i class="fas fa-file-excel"></i> Excel',
        "className" => "btn btn-outline-success btn-sm",
        "filename" => "#{filename_base}_#{timestamp}"
      },
      {
        "extend" => "pdf",
        "text" => '<i class="fas fa-file-pdf"></i> PDF',
        "className" => "btn btn-outline-danger btn-sm",
        "filename" => "#{filename_base}_#{timestamp}",
        "orientation" => "landscape",
        "pageSize" => "A4"
      },
      {
        "extend" => "print",
        "text" => '<i class="fas fa-print"></i> Print',
        "className" => "btn btn-outline-info btn-sm"
      }
    ]
  end

  # Generate language configuration
  def datatables_language(entity_name)
    {
      "search" => "Search #{entity_name}:",
      "lengthMenu" => "Show _MENU_ #{entity_name} per page",
      "info" => "Showing _START_ to _END_ of _TOTAL_ #{entity_name}",
      "infoEmpty" => "No #{entity_name} found",
      "infoFiltered" => "(filtered from _MAX_ total #{entity_name})",
      "paginate" => {
        "first" => "First",
        "last" => "Last", 
        "next" => "Next",
        "previous" => "Previous"
      },
      "emptyTable" => "No #{entity_name} available",
      "zeroRecords" => "No matching #{entity_name} found"
    }
  end

  # Initialize DataTables with configuration
  def datatables_script(table_id, options = {})
    config = datatables_config(table_id, options)
    
    content_tag :script do
      raw "
        $(document).ready(function() {
          $('##{table_id}').DataTable(#{config.to_json});
          
          // Initialize tooltips
          $('[data-toggle=\"tooltip\"]').tooltip();
          
          // Custom filters if provided
          #{custom_filters_script(table_id, options[:custom_filters]) if options[:custom_filters]}
        });
      "
    end
  end

  # Generate custom filter scripts
  def custom_filters_script(table_id, filters)
    return "" unless filters.is_a?(Array)
    
    filters.map do |filter|
      "
        $('##{filter[:id]}').on('change', function() {
          var value = $(this).val();
          var table = $('##{table_id}').DataTable();
          if (value) {
            table.column(#{filter[:column]}).search('^' + value + '$', true, false).draw();
          } else {
            table.column(#{filter[:column]}).search('').draw();
          }
        });
      "
    end.join("\n")
  end

  # Determine if a table should use DataTables based on record count
  def should_use_datatables?(collection, threshold: 10)
    return false unless collection.respond_to?(:count)
    collection.count > threshold
  end

  # Wrapper for conditional DataTables usage
  def enhanced_table(collection, table_id, options = {}, &block)
    if should_use_datatables?(collection, threshold: options[:threshold] || 10)
      # Use DataTables for large collections
      content_tag :div, class: "w3-responsive" do
        content_tag(:table, id: table_id, class: "table table-striped table-bordered", style: "width:100%", &block) +
        datatables_script(table_id, options)
      end
    else
      # Use simple table for small collections
      content_tag :div, class: "w3-responsive" do
        content_tag :table, class: "w3-table w3-striped w3-bordered", &block
      end
    end
  end
end