# annowise
Annotation layer for PDF.js

A basic JavasScript library which relies on JQuery, Rangy and Raphael to create an annotation layer on top of PDF.js from Mozilla.

To get started use the following code: 
```
<!-- Annowise setup -->
	<!-- Rangy modules for selection management -->
  <script src="https://code.jquery.com/jquery-2.2.4.min.js" integrity="sha256-BbhdlvQf/xTY9gja0Dq3HiwQF8LaCRTXxZKRutelT44=" rossorigin="anonymous"></script>
	<script type="text/javascript" src="https://rawgit.com/timdown/rangy/master/lib/rangy-core.js"></script>
	<script type="text/javascript" src="https://rawgit.com/timdown/rangy/master/lib/rangy-classapplier.js"></script>
	<script type="text/javascript" src="https://rawgit.com/timdown/rangy/master/lib/rangy-highlighter.js"></script>
	<script type="text/javascript" src="https://rawgit.com/timdown/rangy/master/lib/rangy-serializer.js"></script>
	<script type="text/javascript" src="https://yandex.st/raphael/1.5.2/raphael.min.js"></script>
      
  <script src="[/path/to]/annotate.js"></script>
	<script type="text/javascript">
	  // Event listeners for PDF viewer
	  document.addEventListener('textlayerrendered', AnnoWise.render, true);
	  window.addEventListener('click', AnnoWise.textHighlighted);
	  $(document).ready(AnnoWise.initialize);
	</script>
<!-- End of Annowise setup -->
```

Here is a screenshot of this working.
![Image of Screenshot](https://github.com/tobywisener/annowise/blob/master/Screenshot_3.png?raw=true)
